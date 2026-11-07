import { redirect } from 'next/navigation';

/** The executive dashboard lands here on Day 12; until then, start at the upload screen. */
export default function Home() {
  redirect('/upload');
}
