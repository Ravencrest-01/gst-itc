export default function Dashboard() {
  return (
    <main className="flex-1 overflow-y-auto mt-[48px] p-container_margin bg-[#F5F7FA]">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-headline-lg text-headline-lg text-on-surface">Dashboard</h2>
        <button className="bg-[#1F4E79] hover:bg-[#0b61a1] text-white font-data-tabular text-data-tabular px-4 py-2 rounded transition-colors flex items-center gap-2 h-[32px]">
          <span className="material-symbols-outlined text-[16px]">add</span>
          New reconciliation
        </button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* Card 1 */}
        <div className="card-outline rounded-lg p-4 flex flex-col justify-between h-[100px]">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Open runs</span>
            <span className="material-symbols-outlined text-outline text-[18px]">pending_actions</span>
          </div>
          <div className="font-headline-lg text-headline-lg text-primary text-[28px] mt-2">
            4
          </div>
        </div>

        {/* Card 2 */}
        <div className="card-outline rounded-lg p-4 flex flex-col justify-between h-[100px]">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">ITC Recovered (FY)</span>
            <span className="material-symbols-outlined text-outline text-[18px]">verified</span>
          </div>
          <div className="font-headline-lg text-headline-lg text-primary text-[28px] mt-2 font-data-tabular">
            ₹48.2L
          </div>
        </div>

        {/* Card 3 */}
        <div className="card-outline rounded-lg p-4 flex flex-col justify-between h-[100px] border-l-4 border-l-error">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">ITC at risk</span>
            <span className="material-symbols-outlined text-error text-[18px]">warning</span>
          </div>
          <div className="font-headline-lg text-headline-lg text-error text-[28px] mt-2 font-data-tabular">
            ₹3,45,000
          </div>
        </div>

        {/* Card 4 */}
        <div className="card-outline rounded-lg p-4 flex flex-col justify-between h-[100px]">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Vendors flagged</span>
            <span className="material-symbols-outlined text-outline text-[18px]">flag</span>
          </div>
          <div className="font-headline-lg text-headline-lg text-primary text-[28px] mt-2">
            12
          </div>
        </div>
      </div>

      {/* Main Split Area */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left: Recent Runs Table (2/3) */}
        <div className="col-span-2 card-outline rounded-lg flex flex-col overflow-hidden h-[450px]">
          <div className="px-4 py-3 border-b border-outline-variant bg-white flex justify-between items-center shrink-0">
            <h3 className="font-headline-md text-headline-md text-on-surface">Recent reconciliation runs</h3>
            <a className="font-body-sm text-body-sm text-secondary hover:underline" href="#">View all</a>
          </div>
          <div className="overflow-x-auto overflow-y-auto flex-1 bg-white">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead className="sticky top-0 table-header-bg z-10 shadow-[0_1px_0_#e3e8ef]">
                <tr>
                  <th className="p-table_cell_padding font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap border-b border-outline-variant">Tax period</th>
                  <th className="p-table_cell_padding font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap border-b border-outline-variant">Status</th>
                  <th className="p-table_cell_padding font-label-caps text-label-caps text-on-surface-variant uppercase text-right whitespace-nowrap border-b border-outline-variant">Invoices</th>
                  <th className="p-table_cell_padding font-label-caps text-label-caps text-on-surface-variant uppercase text-right whitespace-nowrap border-b border-outline-variant">Matched %</th>
                  <th className="p-table_cell_padding font-label-caps text-label-caps text-on-surface-variant uppercase text-right whitespace-nowrap border-b border-outline-variant">ITC at risk (₹)</th>
                  <th className="p-table_cell_padding font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap border-b border-outline-variant">Created on</th>
                  <th className="p-table_cell_padding w-10 border-b border-outline-variant"></th>
                </tr>
              </thead>
              <tbody className="font-data-tabular text-data-tabular text-on-surface bg-white">
                {/* Row 1 */}
                <tr className="table-row-hover border-b border-[#F9FAFB]">
                  <td className="p-table_cell_padding whitespace-nowrap">Mar 2026</td>
                  <td className="p-table_cell_padding">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#e6f4ea] text-[#1e4620]">Review</span>
                  </td>
                  <td className="p-table_cell_padding text-right">452</td>
                  <td className="p-table_cell_padding text-right">88%</td>
                  <td className="p-table_cell_padding text-right text-error font-semibold">2,10,400</td>
                  <td className="p-table_cell_padding whitespace-nowrap text-on-surface-variant text-[12px]">12 May, 10:30</td>
                  <td className="p-table_cell_padding text-right">
                    <a className="text-secondary hover:text-primary transition-colors flex items-center justify-end" href="#">
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </a>
                  </td>
                </tr>
                {/* Row 2 */}
                <tr className="table-row-hover border-b border-[#F9FAFB] bg-[#F9FAFB]">
                  <td className="p-table_cell_padding whitespace-nowrap">Feb 2026</td>
                  <td className="p-table_cell_padding">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#f1f3f4] text-[#3c4043]">Closed</span>
                  </td>
                  <td className="p-table_cell_padding text-right">389</td>
                  <td className="p-table_cell_padding text-right">98%</td>
                  <td className="p-table_cell_padding text-right">12,500</td>
                  <td className="p-table_cell_padding whitespace-nowrap text-on-surface-variant text-[12px]">05 Apr, 14:15</td>
                  <td className="p-table_cell_padding text-right">
                    <a className="text-secondary hover:text-primary transition-colors flex items-center justify-end" href="#">
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </a>
                  </td>
                </tr>
                {/* Row 3 */}
                <tr className="table-row-hover border-b border-[#F9FAFB]">
                  <td className="p-table_cell_padding whitespace-nowrap">Jan 2026</td>
                  <td className="p-table_cell_padding">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#f1f3f4] text-[#3c4043]">Closed</span>
                  </td>
                  <td className="p-table_cell_padding text-right">412</td>
                  <td className="p-table_cell_padding text-right">99%</td>
                  <td className="p-table_cell_padding text-right">4,200</td>
                  <td className="p-table_cell_padding whitespace-nowrap text-on-surface-variant text-[12px]">02 Mar, 09:45</td>
                  <td className="p-table_cell_padding text-right">
                    <a className="text-secondary hover:text-primary transition-colors flex items-center justify-end" href="#">
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </a>
                  </td>
                </tr>
                {/* Row 4 */}
                <tr className="table-row-hover border-b border-[#F9FAFB] bg-[#F9FAFB]">
                  <td className="p-table_cell_padding whitespace-nowrap">Dec 2025</td>
                  <td className="p-table_cell_padding">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#f1f3f4] text-[#3c4043]">Closed</span>
                  </td>
                  <td className="p-table_cell_padding text-right">520</td>
                  <td className="p-table_cell_padding text-right">100%</td>
                  <td className="p-table_cell_padding text-right text-on-surface-variant">-</td>
                  <td className="p-table_cell_padding whitespace-nowrap text-on-surface-variant text-[12px]">10 Jan, 11:20</td>
                  <td className="p-table_cell_padding text-right">
                    <a className="text-secondary hover:text-primary transition-colors flex items-center justify-end" href="#">
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </a>
                  </td>
                </tr>
                {/* Row 5 */}
                <tr className="table-row-hover border-b border-[#F9FAFB]">
                  <td className="p-table_cell_padding whitespace-nowrap">Nov 2025</td>
                  <td className="p-table_cell_padding">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#fef7e0] text-[#b06000]">Pending</span>
                  </td>
                  <td className="p-table_cell_padding text-right">310</td>
                  <td className="p-table_cell_padding text-right">85%</td>
                  <td className="p-table_cell_padding text-right text-error font-semibold">1,17,900</td>
                  <td className="p-table_cell_padding whitespace-nowrap text-on-surface-variant text-[12px]">05 Dec, 16:00</td>
                  <td className="p-table_cell_padding text-right">
                    <a className="text-secondary hover:text-primary transition-colors flex items-center justify-end" href="#">
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </a>
                  </td>
                </tr>
                {/* Row 6 */}
                <tr className="table-row-hover border-b border-[#F9FAFB] bg-[#F9FAFB]">
                  <td className="p-table_cell_padding whitespace-nowrap">Oct 2025</td>
                  <td className="p-table_cell_padding">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#f1f3f4] text-[#3c4043]">Closed</span>
                  </td>
                  <td className="p-table_cell_padding text-right">485</td>
                  <td className="p-table_cell_padding text-right">96%</td>
                  <td className="p-table_cell_padding text-right">24,000</td>
                  <td className="p-table_cell_padding whitespace-nowrap text-on-surface-variant text-[12px]">08 Nov, 10:10</td>
                  <td className="p-table_cell_padding text-right">
                    <a className="text-secondary hover:text-primary transition-colors flex items-center justify-end" href="#">
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Action Needed List (1/3) */}
        <div className="col-span-1 card-outline rounded-lg flex flex-col h-[450px]">
          <div className="px-4 py-3 border-b border-outline-variant bg-white flex items-center justify-between shrink-0">
            <h3 className="font-headline-md text-headline-md text-on-surface">Action needed</h3>
            <span className="material-symbols-outlined text-outline-variant text-[18px]">task_alt</span>
          </div>
          <div className="flex-1 overflow-y-auto bg-white p-2">
            <ul className="flex flex-col gap-1">
              {/* Action Item 1 */}
              <li>
                <a className="flex items-start gap-3 p-3 rounded hover:bg-[#F8FAFC] transition-colors border border-transparent hover:border-outline-variant/30 group" href="#">
                  <div className="mt-1 w-2 h-2 rounded-full bg-[#fbbc04] shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body-sm text-body-sm text-on-surface font-medium leading-tight">32 probable matches to review</p>
                    <p className="font-label-caps text-label-caps text-on-surface-variant mt-1">Apr 2026</p>
                  </div>
                  <span className="material-symbols-outlined text-outline-variant group-hover:text-secondary text-[18px]">chevron_right</span>
                </a>
              </li>
              {/* Action Item 2 */}
              <li>
                <a className="flex items-start gap-3 p-3 rounded hover:bg-[#F8FAFC] transition-colors border border-transparent hover:border-outline-variant/30 group" href="#">
                  <div className="mt-1 w-2 h-2 rounded-full bg-error shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body-sm text-body-sm text-on-surface font-medium leading-tight">₹2,10,400 missing in portal</p>
                    <p className="font-label-caps text-label-caps text-on-surface-variant mt-1">Mar 2026</p>
                  </div>
                  <span className="material-symbols-outlined text-outline-variant group-hover:text-secondary text-[18px]">chevron_right</span>
                </a>
              </li>
              {/* Action Item 3 */}
              <li>
                <a className="flex items-start gap-3 p-3 rounded hover:bg-[#F8FAFC] transition-colors border border-transparent hover:border-outline-variant/30 group" href="#">
                  <div className="mt-1 w-2 h-2 rounded-full bg-[#fbbc04] shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body-sm text-body-sm text-on-surface font-medium leading-tight">Vendor "TechServe" marked inactive</p>
                    <p className="font-label-caps text-label-caps text-on-surface-variant mt-1">System Alert</p>
                  </div>
                  <span className="material-symbols-outlined text-outline-variant group-hover:text-secondary text-[18px]">chevron_right</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
