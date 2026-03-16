'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowLeft, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface CertificateResultsProps {
  rollNumber: string;
  events: string[];
  errors: string[];
  message: string;
  onReset: () => void;
}

function getEventId(eventName: string) {
  return eventName.toLowerCase().replace(/\s+/g, '-');
}

export function CertificateResults({
  rollNumber,
  events,
  errors,
  message,
  onReset,
}: CertificateResultsProps) {
  const [generatingEventId, setGeneratingEventId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async (eventName: string) => {
    const eventId = getEventId(eventName);
    setGeneratingEventId(eventId);
    setDownloadError(null);

    try {
      const response = await fetch(
        `/api/certificate?event=${encodeURIComponent(eventId)}&roll=${encodeURIComponent(rollNumber)}`
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message || result?.error || 'Certificate generation failed');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      anchor.href = downloadUrl;
      anchor.download = filenameMatch?.[1] || `${eventId}-${rollNumber}-specfiesta-2026.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Certificate generation failed');
    } finally {
      setGeneratingEventId(null);
    }
  };

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Certificates Found
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Roll Number: <span className="font-semibold">{rollNumber}</span>
          </p>
        </div>
        <Button variant="outline" onClick={onReset} className="w-full sm:w-auto">
          <ArrowLeft className="mr-2 h-4 w-4" />
          New Search
        </Button>
      </div>

      {message ? (
        <Card className="border border-border bg-card/70">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {message}
          </CardContent>
        </Card>
      ) : null}

      {errors.length > 0 ? (
        <Card className="border border-amber-500/40 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-700">
              <AlertCircle className="h-4 w-4" />
              Partial verification issues
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-800">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {downloadError ? (
        <Card className="border border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6 text-sm text-destructive">
            {downloadError}
          </CardContent>
        </Card>
      ) : null}

      {events.length > 0 ? (
        <div className="space-y-4">
          <h3 className="flex items-center text-lg font-semibold text-foreground">
            <CheckCircle2 className="mr-2 h-5 w-5 text-green-600" />
            Events Participated ({events.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {events.map((eventName) => {
              const eventId = getEventId(eventName);
              const isGenerating = generatingEventId === eventId;

              return (
                <Card
                  key={eventName}
                  className="border border-border bg-card transition-colors hover:bg-card/80"
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center text-lg">
                      <CheckCircle2 className="mr-3 h-4 w-4 text-green-600" />
                      {eventName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      className="w-full"
                      onClick={() => handleDownload(eventName)}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <>
                          <Spinner className="mr-2 h-4 w-4" />
                          Generating certificate...
                        </>
                      ) : (
                        'Download Certificate'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <Card className="border border-destructive/50 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Participant not found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive/80">
              This roll number was not found in any event.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
