'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from './locale-switcher';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AUTH_HINT_CHANGED_EVENT, readAuthHint } from '@/lib/auth/hint';
// import { WhatsNew } from '@/components/whats-new';
import { ThemeToggle } from './theme-toggle';

const navLinks = [
  { href: '/blog', label: 'common.blog', type: 'page' },
  { href: '#pricing', label: 'common.pricing', type: 'anchor' },
  { href: '#deploy', label: 'common.deploy', type: 'anchor' },
];

export function Header() {
  const t = useTranslations();
  const locale = useLocale() as string;
  const [isOpen, setIsOpen] = useState(false);

  // Read localStorage auth hint after hydration to avoid querying the DB
  // for anonymous visitors. useSyncExternalStore avoids hydration mismatch:
  // server snapshot always returns false, client snapshot reads localStorage.
  const hasAuthHint = useSyncExternalStore(
    (listener) => {
      if (typeof window === 'undefined') return () => {};
      window.addEventListener(AUTH_HINT_CHANGED_EVENT, listener);
      window.addEventListener('storage', listener);
      return () => {
        window.removeEventListener(AUTH_HINT_CHANGED_EVENT, listener);
        window.removeEventListener('storage', listener);
      };
    },
    // Client snapshot — read localStorage after hydration.
    readAuthHint,
    // Server snapshot — always false so SSR matches the first frame.
    () => false,
  );

  const closeMobileMenu = () => setIsOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#e7ddd2] bg-[#f9f6f1]/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:px-10">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <Image
            src="/brand/clawsimple.svg"
            alt="ClawSimple logo"
            width={32}
            height={32}
            className="h-8 w-8"
            priority
          />
          <span className="text-lg font-semibold text-[#171512] dark:text-zinc-100">
            ClawSimple
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex md:items-center md:gap-6">
          {navLinks.map((link) => {
            const isExternal = link.type === 'external';
            const href = isExternal
              ? link.href
              : `/${locale}${link.href.startsWith('#') ? link.href : link.href}`;

            return isExternal ? (
              <a
                key={link.href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[#5c534c] transition-colors hover:text-[#171512] dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                {t(link.label)}
              </a>
            ) : (
              <Link
                key={link.href}
                href={href}
                className="text-sm font-medium text-[#5c534c] transition-colors hover:text-[#171512] dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                {t(link.label)}
              </Link>
            );
          })}
          {/* <WhatsNew
            trigger={
              <button type="button" className="text-sm font-medium text-[#5c534c] transition-colors hover:text-[#171512] dark:text-zinc-300 dark:hover:text-zinc-100">
                What&apos;s New
              </button>
            }
          /> */}
        </nav>

        <div className="hidden md:flex md:items-center md:gap-4">
{/* Removed WhatsNew from here */}
          <ThemeToggle />
          <LocaleSwitcher />
          <Button variant="ghost" size="sm" className="text-[#5c534c] dark:text-zinc-300" asChild>
            <Link href={hasAuthHint ? `/${locale}/profile` : `/${locale}/signin`}>
              {hasAuthHint ? t('common.dashboard') : t('common.signIn')}
            </Link>
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          className="text-[#171512] dark:text-zinc-100 md:hidden"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden"
          >
            <nav className="border-t border-[#e7ddd2] bg-[#f9f6f1] p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-col gap-4">
                  {navLinks.map((link) => {
                    const isExternal = link.type === 'external';
                  const href = isExternal
                    ? link.href
                    : `/${locale}${link.href.startsWith('#') ? link.href : link.href}`;

                  return isExternal ? (
                    <a
                      key={link.href}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-[#5c534c] transition-colors hover:text-[#171512] dark:text-zinc-300 dark:hover:text-zinc-100"
                      onClick={() => setIsOpen(false)}
                    >
                      {t(link.label)}
                    </a>
                  ) : (
                    <Link
                      key={link.href}
                      href={href}
                      className="text-sm font-medium text-[#5c534c] transition-colors hover:text-[#171512] dark:text-zinc-300 dark:hover:text-zinc-100"
                      onClick={() => setIsOpen(false)}
                    >
                      {t(link.label)}
                    </Link>
                  );
                })}
                <div className="flex flex-col gap-2 pt-2">
                  {/* <div className="px-2 py-2">
                    <WhatsNew
                      trigger={
                        <button
                          type="button"
                          onClick={closeMobileMenu}
                          className="text-sm font-medium text-[#5c534c] transition-colors hover:text-[#171512] dark:text-zinc-300 dark:hover:text-zinc-100"
                        >
                          What&apos;s New
                        </button>
                      }
                    />
                  </div> */}
                  <div className="px-2">
                    <ThemeToggle />
                  </div>
                  <LocaleSwitcher />
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="w-full justify-start text-[#5c534c] dark:text-zinc-300"
                  >
                    <Link href={hasAuthHint ? `/${locale}/profile` : `/${locale}/signin`} onClick={closeMobileMenu}>
                      {hasAuthHint ? t('common.dashboard') : t('common.signIn')}
                    </Link>
                  </Button>
                </div>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
