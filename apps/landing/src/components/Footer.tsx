export default function Footer() {
  return (
    <footer className="py-12 bg-gray-900">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <div>
              <span className="text-2xl font-bold text-white">HEYS</span>
              <p className="text-gray-400 text-sm mt-1">
                Персональное сопровождение питания
              </p>
            </div>
            
            {/* Links */}
            <div className="flex gap-6 text-sm">
              <a href="/legal/user-agreement" className="text-gray-400 hover:text-white transition-colors">
                Пользовательское соглашение
              </a>
              <a href="/legal/privacy-policy" className="text-gray-400 hover:text-white transition-colors">
                Политика конфиденциальности
              </a>
            </div>
          </div>
          
          {/* Disclaimer */}
          <div className="mt-8 pt-8 border-t border-gray-800">
            <p className="text-gray-500 text-sm text-center">
              HEYS — сервис сопровождения питания. Не является медицинской услугой. 
              Куратор — специалист по питанию, не врач. При наличии заболеваний 
              проконсультируйтесь с врачом.
            </p>
            <p className="text-gray-600 text-sm text-center mt-4">
              © {new Date().getFullYear()} HEYS. Все права защищены.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
