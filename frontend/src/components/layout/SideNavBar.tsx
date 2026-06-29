export default function SideNavBar() {
  return (
    <nav className="fixed left-0 top-0 h-full w-[240px] bg-primary text-on-primary border-r border-outline-variant flex flex-col z-40">
      {/* Header */}
      <div className="px-4 py-4 flex items-center gap-3 border-b border-white/10">
        <div className="w-8 h-8 rounded bg-on-primary/10 flex items-center justify-center shrink-0">
          <img 
            alt="CA Firm Logo" 
            className="w-5 h-5 object-contain opacity-90" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuB2fK6QwlHFcu3NLUg5LMA7ymBKuDV9cQwOqMrv43GChlMpFPfWGNK8902NlNPEtAM9MmO3y3OChnVKZrjvFW1NOI27y3l9k8pYOyQSaxl6OhFZ1Sj-6YSkg8o35IokEaEvLJU4FxKx-bkRRzCADzDoz-ozTarklx-mfAbClPEKBfI0JP4xVw19sJjBKrKZ2G-lkX97Slnd_k0_jaTpPv46JF2Z34Xu7k7v93wnqz0ikYl-HQr7ONZI73g51EcsNqDQiiWpsf4kWFc"
          />
        </div>
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-on-primary truncate">GST Reconciliation</h1>
          <p className="font-body-sm text-body-sm opacity-70 truncate">Professional Edition</p>
        </div>
      </div>
      
      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-4">
        <ul className="flex flex-col gap-1">
          {/* Active Item: Dashboard */}
          <li>
            <a className="bg-secondary text-on-secondary rounded-lg mx-2 px-4 py-3 flex items-center gap-3 transition-colors duration-200" href="#">
              <span className="material-symbols-outlined" data-weight="fill">dashboard</span>
              <span className="font-body-sm text-body-sm font-medium">Dashboard</span>
            </a>
          </li>
          <li>
            <a className="text-on-primary opacity-80 hover:opacity-100 hover:bg-primary-container/50 rounded-lg mx-2 px-4 py-3 flex items-center gap-3 transition-colors duration-200" href="#">
              <span className="material-symbols-outlined">sync_alt</span>
              <span className="font-body-sm text-body-sm">Reconciliation</span>
            </a>
          </li>
          <li>
            <a className="text-on-primary opacity-80 hover:opacity-100 hover:bg-primary-container/50 rounded-lg mx-2 px-4 py-3 flex items-center gap-3 transition-colors duration-200" href="#">
              <span className="material-symbols-outlined">cloud_upload</span>
              <span className="font-body-sm text-body-sm">Uploads</span>
            </a>
          </li>
          <li>
            <a className="text-on-primary opacity-80 hover:opacity-100 hover:bg-primary-container/50 rounded-lg mx-2 px-4 py-3 flex items-center gap-3 transition-colors duration-200" href="#">
              <span className="material-symbols-outlined">description</span>
              <span className="font-body-sm text-body-sm">Reports</span>
            </a>
          </li>
          <li>
            <a className="text-on-primary opacity-80 hover:opacity-100 hover:bg-primary-container/50 rounded-lg mx-2 px-4 py-3 flex items-center gap-3 transition-colors duration-200" href="#">
              <span className="material-symbols-outlined">settings</span>
              <span className="font-body-sm text-body-sm">Settings</span>
            </a>
          </li>
        </ul>
      </div>
      
      {/* User Footer Mini */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-tint flex items-center justify-center text-on-primary font-bold text-xs">AJ</div>
          <div className="overflow-hidden">
            <p className="font-body-sm text-body-sm truncate">Amit Jain</p>
            <p className="text-[10px] opacity-70 truncate">Admin</p>
          </div>
        </div>
      </div>
    </nav>
  );
}
