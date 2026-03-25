import type { Metadata } from 'next';
import './globals.css';
import DemoBanner from '@/components/DemoBanner';

export const metadata: Metadata = {
  title: 'JLM Claw',
  description: 'JLM Claw Mission Shell',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className="bg-mc-bg text-mc-text min-h-screen">
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
