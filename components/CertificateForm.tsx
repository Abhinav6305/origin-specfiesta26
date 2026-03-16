'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  FieldGroup,
  Field,
  FieldLabel,
} from '@/components/ui/field';

const formSchema = z.object({
  rollNumber: z.string().min(1, 'Roll number is required').max(20),
});

type FormData = z.infer<typeof formSchema>;
type CertificateSearchResponse = {
  found: boolean;
  events: string[];
  errors?: string[];
  message?: string;
};

interface CertificateFormProps {
  onSubmit: (data: FormData, results: CertificateSearchResponse) => void;
  isLoading?: boolean;
}

export function CertificateForm({ onSubmit, isLoading = false }: CertificateFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const onFormSubmit = async (data: FormData) => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/certificates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.message || 'Failed to generate certificates');
        setIsSubmitting(false);
        return;
      }

      onSubmit(data, result);
      reset();
      setIsSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="w-full max-w-xl rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm shadow-black/5 sm:p-8"
    >
      <div className="space-y-6">
        <div>
          <h2 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
            Get Your Certificate
          </h2>
          <p className="max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
            Enter your roll number to instantly find and download every Specfiesta 2026 certificate linked to your registration.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="rollNumber">Roll Number</FieldLabel>
            <Input
              id="rollNumber"
              placeholder="Enter your roll number"
              {...register('rollNumber')}
              disabled={isSubmitting || isLoading}
              className={`h-12 text-base uppercase tracking-[0.08em] ${errors.rollNumber ? 'border-destructive' : ''}`}
            />
            {errors.rollNumber && (
              <p className="text-destructive text-sm mt-1">
                {errors.rollNumber.message}
              </p>
            )}
          </Field>
        </FieldGroup>

        <Button
          type="submit"
          disabled={isSubmitting || isLoading}
          className="w-full"
        >
          {isSubmitting || isLoading ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Searching participant...
            </>
          ) : (
            'Search Certificates'
          )}
        </Button>
      </div>
    </form>
  );
}
