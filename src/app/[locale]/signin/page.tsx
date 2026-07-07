'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { authClient } from '@/lib/auth/client';
import { trackUmami, markSignupStarted } from '@/lib/analytics/umami';

type MagicLinkResponse = {
  error?: string | { message?: string };
};

const getAuthErrorMessage = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as MagicLinkResponse;
  if (!candidate.error) return null;
  if (typeof candidate.error === 'string') return candidate.error;
  return candidate.error.message ?? 'Failed to send magic link';
};

const GoogleIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-4 w-4"
  >
    <path
      fill="#EA4335"
      d="M12 10.2v3.95h5.52c-.22 1.3-1.51 3.8-5.52 3.8A6.1 6.1 0 0 1 6 12a6.1 6.1 0 0 1 6-5.95c1.73 0 2.9.73 3.57 1.37l2.44-2.35C16.4 3.47 14.4 2.4 12 2.4 6.96 2.4 2.9 6.45 2.9 12S6.96 21.6 12 21.6c6.93 0 8.62-4.86 8.62-7.4 0-.5-.05-.87-.12-1.24H12Z"
    />
    <path
      fill="#34A853"
      d="M3.72 7.34l3.2 2.35A6.08 6.08 0 0 1 12 6.05c1.73 0 2.9.73 3.57 1.37l2.44-2.35C16.4 3.47 14.4 2.4 12 2.4c-3.5 0-6.53 1.94-8.28 4.94Z"
    />
    <path
      fill="#FBBC05"
      d="M3.72 16.66C5.45 19.66 8.5 21.6 12 21.6c2.35 0 4.34-.77 5.78-2.09l-2.82-2.18c-.75.53-1.75.9-2.96.9-2.05 0-3.8-1.34-4.42-3.23l-3.36 2.46Z"
    />
    <path
      fill="#4285F4"
      d="M20.62 12c0-.37-.05-.74-.12-1.1H12v3.95h5.52c-.29 1.05-1.12 2.45-2.88 3.27l2.82 2.18c1.64-1.52 2.6-3.76 2.6-6.3Z"
    />
  </svg>
);

export default function SignInPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState('');
  const [redirectTo, setRedirectTo] = useState(`/${locale}`);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    if (redirect) {
      try {
        const url = new URL(redirect, window.location.origin);
        if (url.origin !== window.location.origin) {
          setRedirectTo(`/${locale}`);
          return;
        }
        const searchParams = new URLSearchParams(url.search);
        if (url.hash) {
          const anchor = url.hash.replace('#', '');
          if (anchor) {
            searchParams.set('anchor', anchor);
          }
        }
        const search = searchParams.toString();
        setRedirectTo(`${url.pathname}${search ? `?${search}` : ''}`);
      } catch {
        setRedirectTo(redirect.startsWith('/') ? redirect : `/${locale}`);
      }
    }
  }, [locale]);

  const signupStartedTracked = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!signupStartedTracked.current) {
      signupStartedTracked.current = true;
      markSignupStarted('magic_link');
      trackUmami('Signup Started', {
        source_page: window.location.pathname,
        method: 'magic_link',
      });
    }

    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: `/${locale}/auth/signed-in?redirect=${encodeURIComponent(redirectTo)}`,
      });

      const errorMessage = getAuthErrorMessage(result);
      if (errorMessage) throw new Error(errorMessage);

      setIsSent(true);
    } catch {
      setError(t('auth.signIn.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError('');

    if (!signupStartedTracked.current) {
      signupStartedTracked.current = true;
      markSignupStarted('google_oauth');
      trackUmami('Signup Started', {
        source_page: window.location.pathname,
        method: 'google_oauth',
      });
    }

    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: `/${locale}/auth/signed-in?redirect=${encodeURIComponent(redirectTo)}`,
      });

      const errorMessage = getAuthErrorMessage(result);
      if (errorMessage) throw new Error(errorMessage);
    } catch {
      setError(t('auth.signIn.error'));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center border-t border-zinc-200 bg-gradient-to-b from-violet-50 to-white px-4 py-12 dark:border-zinc-800 dark:from-violet-950/20 dark:to-black">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Link
          href={`/${locale}`}
          className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          <ArrowLeft size={16} />
          {t('common.overview')}
        </Link>

        <Card className="border-zinc-200 shadow-lg dark:border-zinc-800">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
              <Mail className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold">
              {t('auth.signIn.title')}
            </CardTitle>
            <CardDescription>
              {t('auth.signIn.description')}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isSent ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-950/20"
              >
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  {t('auth.signIn.sent')}
                </p>
              </motion.div>
            ) : (
              <div className="space-y-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  {t('auth.signIn.google')}
                </Button>

                <div className="relative flex items-center justify-center">
                  <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800" />
                  <span className="absolute bg-white px-3 text-xs uppercase tracking-widest text-zinc-500 dark:bg-zinc-950">
                    {t('auth.signIn.or')}
                  </span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('auth.signIn.emailLabel')}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('auth.signIn.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="border-zinc-300 dark:border-zinc-700"
                    />
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-red-600 dark:text-red-400"
                    >
                      {error}
                    </motion.p>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      t('auth.signIn.submit')
                    )}
                  </Button>
                </form>
              </div>
            )}

            <div className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
              <p>
                By signing in, you agree to our{' '}
                <Link
                  href={`/${locale}/terms`}
                  className="underline hover:text-zinc-900 dark:hover:text-zinc-50"
                >
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link
                  href={`/${locale}/privacy`}
                  className="underline hover:text-zinc-900 dark:hover:text-zinc-50"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
