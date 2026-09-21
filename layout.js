import './globals.css'

export const metadata = {
  title: '畑しごと',
  description: '共有できる農作業管理アプリ',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: '畑しごと', statusBarStyle: 'default' },
  icons: { apple: '/apple-icon.svg' },
}

export default function RootLayout({ children }) {
  return <html lang="ja"><body>{children}</body></html>
}
