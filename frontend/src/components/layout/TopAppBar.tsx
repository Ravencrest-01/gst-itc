export default function TopAppBar() {
  return (
    <header className="fixed top-0 right-0 w-[calc(100%-240px)] h-[48px] bg-surface border-b border-outline-variant flex justify-between items-center px-gutter z-50">
      <div className="flex items-center gap-4 h-full">
        <span className="font-headline-md text-headline-md font-bold text-primary">ProTax Solutions</span>
        <div className="h-4 w-px bg-outline-variant mx-2"></div>
        {/* Navigation Link (Filter context) */}
        <nav className="h-full flex items-center">
          <a className="h-full flex items-center px-2 text-secondary font-bold border-b-2 border-secondary font-label-caps text-label-caps" href="#">Apr-Mar 2024</a>
        </nav>
      </div>
      
      <div className="flex items-center gap-3">
        <button className="text-on-surface-variant hover:text-primary transition-all p-1 cursor-pointer relative flex items-center justify-center">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"></span>
        </button>
        <button className="text-on-surface-variant hover:text-primary transition-all p-1 cursor-pointer flex items-center justify-center">
          <span className="material-symbols-outlined">help_outline</span>
        </button>
        <div className="ml-2 pl-3 border-l border-outline-variant">
          <img 
            alt="User Avatar" 
            className="w-7 h-7 rounded-full object-cover card-outline" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCelNV_hNtgKSqNRZBEI0BuI_RiOO5sFb0Hhway-4fEzx-N7ihuKXYehVDJU-vNqdudHvz1ZBk0AbLB-dPaOtMwECT0a9M8B0KhT_ktGL-cgEpV5C8_5i3wX7P6tTaH-Z3f4rh_ZpqUxok42C_PHKeVe1r1Ali8_JNu1VcxRw45YYVdiN5quOylPOaNCNm3Rgd8YL7fq5n3TZx68OHYoEhSiirkhjsNPX3laQIJusxe8NdbELuIy8toi76FXBaclY8Jtqyyc_wnKfQ"
          />
        </div>
      </div>
    </header>
  );
}
