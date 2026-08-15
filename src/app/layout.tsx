import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cozanet OS — AI Assistant',
  description: 'AI with web search, memory, and browser tools',
  icons: { icon: '/favicon.ico' },
  openGraph: {
    title: 'Cozanet OS',
    description: 'AI with web search, memory, and browser tools',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full">{children}</body>
    </html>
  );
}
