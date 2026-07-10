from typing import List, Dict, Tuple
from rapidfuzz import fuzz
from decimal import Decimal

from app.services.reconciliation.models import NormalizedInvoice, MatchResult, RunSummary
from app.services.reconciliation.buckets import BucketEnum, MatchPassEnum, ReviewStatusEnum
from app.services.reconciliation.config import ReconciliationConfig

def reconcile(pr_rows: List[NormalizedInvoice], twob_rows: List[NormalizedInvoice], config: ReconciliationConfig = None) -> Tuple[List[MatchResult], RunSummary]:
    """
    Run the 4-pass reconciliation pipeline on normalized invoices.
    """
    if config is None:
        config = ReconciliationConfig()
        
    results: List[MatchResult] = []
    
    # We will block by GSTIN to make it efficient
    # Structure: Dict[gstin, { 'pr': List[NormalizedInvoice], '2b': List[NormalizedInvoice] }]
    blocks: Dict[str, Dict[str, List[NormalizedInvoice]]] = {}
    
    for row in pr_rows:
        gstin = row.supplier_gstin
        if gstin not in blocks:
            blocks[gstin] = {'pr': [], '2b': []}
        blocks[gstin]['pr'].append(row)
        
    for row in twob_rows:
        gstin = row.supplier_gstin
        if gstin not in blocks:
            blocks[gstin] = {'pr': [], '2b': []}
        blocks[gstin]['2b'].append(row)
        
    # Track used items within the block to ensure greedy 1-to-1 matching
    for gstin, data in blocks.items():
        pr_unmatched = data['pr']
        twob_unmatched = data['2b']
        
        # PASS 1: Exact
        pr_unmatched, twob_unmatched = _pass_exact(pr_unmatched, twob_unmatched, results, config)
        
        # PASS 2: Normalized
        pr_unmatched, twob_unmatched = _pass_normalized(pr_unmatched, twob_unmatched, results, config)
        
        # PASS 3: Tolerance (mismatched)
        pr_unmatched, twob_unmatched = _pass_tolerance(pr_unmatched, twob_unmatched, results, config)
        
        # PASS 4: Fuzzy (probable)
        pr_unmatched, twob_unmatched = _pass_fuzzy(pr_unmatched, twob_unmatched, results, config)
        
        # Any remaining are pushed back for reverse sweep
        data['pr'] = pr_unmatched
        data['2b'] = twob_unmatched
        
    # PASS 5: Reverse Sweep
    for gstin, data in blocks.items():
        for pr_row in data['pr']:
            results.append(MatchResult(
                purchase_invoice=pr_row,
                portal_invoice=None,
                bucket=BucketEnum.missing_in_portal,
                tax_diff=pr_row.total_tax
            ))
            
        for twob_row in data['2b']:
            results.append(MatchResult(
                purchase_invoice=None,
                portal_invoice=twob_row,
                bucket=BucketEnum.missing_in_books,
                tax_diff=-twob_row.total_tax
            ))
            
    # Calculate Summary
    summary = _calculate_summary(results)
    return results, summary

def _tax_diff(pr_row: NormalizedInvoice, twob_row: NormalizedInvoice) -> Decimal:
    return pr_row.total_tax - twob_row.total_tax

def _within_tolerance(diff: Decimal, pr_row: NormalizedInvoice, config: ReconciliationConfig) -> bool:
    if abs(diff) <= Decimal(str(config.amount_tolerance_rupees)):
        return True
    
    if pr_row.total_tax > 0:
        pct_diff = abs(diff) / pr_row.total_tax * Decimal('100')
        if pct_diff <= Decimal(str(config.amount_tolerance_pct)):
            return True
            
    return False

def _pass_exact(pr_rows, twob_rows, results, config):
    remaining_pr = []
    twob_pool = twob_rows.copy()
    
    for pr in pr_rows:
        matched = False
        for i, twob in enumerate(twob_pool):
            diff = _tax_diff(pr, twob)
            if (pr.invoice_number_norm == twob.invoice_number_norm and
                pr.invoice_date == twob.invoice_date and
                abs(diff) <= Decimal('0.01')):
                
                results.append(MatchResult(
                    purchase_invoice=pr,
                    portal_invoice=twob,
                    bucket=BucketEnum.matched,
                    match_pass=MatchPassEnum.exact,
                    confidence=1.0,
                    tax_diff=diff,
                    review_status=ReviewStatusEnum.confirmed
                ))
                twob_pool.pop(i)
                matched = True
                break
        if not matched:
            remaining_pr.append(pr)
            
    return remaining_pr, twob_pool

def _pass_normalized(pr_rows, twob_rows, results, config):
    remaining_pr = []
    twob_pool = twob_rows.copy()
    
    for pr in pr_rows:
        matched = False
        for i, twob in enumerate(twob_pool):
            if pr.invoice_number_norm == twob.invoice_number_norm:
                diff = _tax_diff(pr, twob)
                if _within_tolerance(diff, pr, config):
                    results.append(MatchResult(
                        purchase_invoice=pr,
                        portal_invoice=twob,
                        bucket=BucketEnum.matched,
                        match_pass=MatchPassEnum.normalized,
                        confidence=0.95,
                        tax_diff=diff,
                        review_status=ReviewStatusEnum.confirmed
                    ))
                    twob_pool.pop(i)
                    matched = True
                    break
        if not matched:
            remaining_pr.append(pr)
            
    return remaining_pr, twob_pool

def _pass_tolerance(pr_rows, twob_rows, results, config):
    remaining_pr = []
    twob_pool = twob_rows.copy()
    
    for pr in pr_rows:
        matched = False
        for i, twob in enumerate(twob_pool):
            if pr.invoice_number_norm == twob.invoice_number_norm:
                diff = _tax_diff(pr, twob)
                # Not within tolerance -> mismatched
                results.append(MatchResult(
                    purchase_invoice=pr,
                    portal_invoice=twob,
                    bucket=BucketEnum.mismatched,
                    match_pass=MatchPassEnum.tolerance,
                    confidence=0.8,
                    tax_diff=diff,
                    review_status=ReviewStatusEnum.pending
                ))
                twob_pool.pop(i)
                matched = True
                break
        if not matched:
            remaining_pr.append(pr)
            
    return remaining_pr, twob_pool

def _pass_fuzzy(pr_rows, twob_rows, results, config):
    remaining_pr = []
    twob_pool = twob_rows.copy()
    
    for pr in pr_rows:
        matched = False
        best_match_idx = -1
        best_score = -1
        
        for i, twob in enumerate(twob_pool):
            # Check if dates and amounts are very close
            diff = _tax_diff(pr, twob)
            if _within_tolerance(diff, pr, config) and pr.invoice_date == twob.invoice_date:
                # Same supplier (via blocking), same date, same amount.
                # Just different invoice numbers. Let's check name similarity if available.
                score = 100.0
                if pr.supplier_name and twob.supplier_name:
                    score = fuzz.ratio(str(pr.supplier_name).lower(), str(twob.supplier_name).lower())
                
                # We can also check invoice number fuzzy match
                inv_score = fuzz.ratio(pr.invoice_number_norm, twob.invoice_number_norm)
                
                # Combine scores
                final_score = (score + inv_score) / 2
                
                if final_score >= config.fuzzy_name_threshold and final_score > best_score:
                    best_score = final_score
                    best_match_idx = i
                    
        if best_match_idx >= 0:
            twob = twob_pool[best_match_idx]
            diff = _tax_diff(pr, twob)
            results.append(MatchResult(
                purchase_invoice=pr,
                portal_invoice=twob,
                bucket=BucketEnum.probable,
                match_pass=MatchPassEnum.fuzzy,
                confidence=round(best_score / 100, 2),
                tax_diff=diff,
                review_status=ReviewStatusEnum.pending
            ))
            twob_pool.pop(best_match_idx)
            matched = True
            
        if not matched:
            remaining_pr.append(pr)
            
    return remaining_pr, twob_pool

def _calculate_summary(results: List[MatchResult]) -> RunSummary:
    summary = RunSummary()
    
    for r in results:
        b_str = r.bucket.value
        summary.counts[b_str] = summary.counts.get(b_str, 0) + 1
        summary.total += 1
        
        if r.bucket == BucketEnum.matched:
            summary.itc_matched += r.purchase_invoice.total_tax
        elif r.bucket in (BucketEnum.mismatched, BucketEnum.missing_in_portal):
            summary.itc_at_risk += abs(r.tax_diff)
            
    if summary.total > 0:
        matched_count = summary.counts.get(BucketEnum.matched.value, 0)
        summary.matched_percentage = round((matched_count / summary.total) * 100, 2)
        
    return summary
