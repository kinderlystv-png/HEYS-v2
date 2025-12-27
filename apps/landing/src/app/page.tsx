// Корень редиректит на вариант A (SSR версия)
// Все лендинги теперь только SSR: /a, /b, /c, /d

import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/a')
}
