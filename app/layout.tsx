import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stack Ranked',
  description: 'Pairwise ranking for your backlog.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
