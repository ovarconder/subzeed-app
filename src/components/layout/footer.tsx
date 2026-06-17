export function Footer() {
  return (
    <footer className="border-t border-border bg-surface mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-text-secondary">
            &copy; {new Date().getFullYear()} SubZeed — สร้างซับไตเติลภาษาไทย อัตโนมัติ
          </p>
          <div className="flex items-center gap-4 text-sm text-text-secondary">
            <a href="/pricing" className="hover:text-text transition-colors">
              แพ็กเกจ
            </a>
            <a href="/terms" className="hover:text-text transition-colors">
              เงื่อนไข
            </a>
            <a href="/privacy" className="hover:text-text transition-colors">
              ความเป็นส่วนตัว
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
