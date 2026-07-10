export function formatMoney(amount) {
  if (amount === undefined || amount === null) return '₹0.00';
  
  // Format as Indian Rupee
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}
