'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CertificateForm } from '@/components/CertificateForm';
import { CertificateResults } from '@/components/CertificateResults';

type SearchResponse = {
  found: boolean;
  events: string[];
  errors?: string[];
  message?: string;
};

export default function Home() {
  const [events, setEvents] = useState<string[] | null>(null);
  const [searchRoll, setSearchRoll] = useState<string>('');
  const [searchErrors, setSearchErrors] = useState<string[]>([]);
  const [searchMessage, setSearchMessage] = useState<string>('');

  const handleFormSubmit = (
    formData: { rollNumber: string },
    apiResults: SearchResponse
  ) => {
    setSearchRoll(formData.rollNumber);
    setEvents(apiResults.events || []);
    setSearchErrors(apiResults.errors || []);
    setSearchMessage(apiResults.message || '');
  };

  const handleReset = () => {
    setEvents(null);
    setSearchRoll('');
    setSearchErrors([]);
    setSearchMessage('');
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,248,246,1))] text-foreground">
      <header className="border-b border-border/70 bg-card/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="order-2 flex-1 sm:order-1">
              <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
                Specfiesta 2k26 - Origin
              </h1>
            </div>
            <div className="order-1 flex-shrink-0 sm:order-2">
              <Image
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Origin%20logo%20-%20black-wYbcABsqlMPfGrdUsmRtVxn5ROVH6K.png"
                alt="Specfiesta Origin Logo"
                width={96}
                height={96}
                priority
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="flex flex-col items-center gap-12">
          {events === null ? (
            <div className="flex w-full justify-center">
              <CertificateForm onSubmit={handleFormSubmit} />
            </div>
          ) : (
            <CertificateResults
              rollNumber={searchRoll}
              events={events}
              message={searchMessage}
              errors={searchErrors}
              onReset={handleReset}
            />
          )}
        </div>
      </main>

      <footer className="mt-16 border-t border-border/70 bg-card/80">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground">
            (C) 2026 Specfiesta. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
