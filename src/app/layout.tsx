import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cozanet OS — AI Assistant',
  description: 'Next-generation AI-native operating system',
  icons: { icon: '/favicon.ico' },
  openGraph: {
    title: 'Cozanet OS',
    description: 'Next-generation AI-native operating system',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="h-full">{children}</body>
    </html>
  );
}
