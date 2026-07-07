"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { AlertTriangle, Boxes, Server, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminNav } from "@/components/admin/admin-nav";

type OverviewStats = {
  totalDeployments: number;
  activeDeployments: number;
  orphanedDeployments: number;
  totalModels: number;
  inactiveModels: number;
};

export default function AdminOverviewPage() {
  const router = useRouter();
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OverviewStats>({
    totalDeployments: 0,
    activeDeployments: 0,
    orphanedDeployments: 0,
    totalModels: 0,
    inactiveModels: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        setLoading(true);
        setForbidden(false);
        setError(null);

        const response = await fetch("/api/admin/stats", {
          credentials: "include",
          cache: "no-store",
        });

        if (response.status === 401) {
          router.push("/");
          return;
        }
        if (response.status === 403) {
          setForbidden(true);
          return;
        }
        if (!response.ok) {
          throw new Error("Failed to load stats");
        }

        const data = (await response.json()) as OverviewStats;

        if (!cancelled) {
          setStats(data);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Response) {
          if (err.status === 401) {
            router.push("/");
            return;
          }
          if (err.status === 403) {
            setForbidden(true);
            return;
          }
          setError(`Failed to load data (${err.status})`);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Loading admin overview...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
            <h1 className="text-lg font-semibold text-red-800">
              Access Denied
            </h1>
            <p className="mt-2 text-sm text-red-700">
              You do not have admin permission.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Admin Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Operational overview and quick access to admin modules.
        </p>
      </div>

      <AdminNav />

      {error && (
        <Card className="mb-6 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <CardContent className="flex items-start justify-between gap-3 py-3 text-sm text-red-600 dark:text-red-400">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-0.5 shrink-0 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-500">
              Total Deployments
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {stats.totalDeployments}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-500">
              Active Deployments
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {stats.activeDeployments}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-500">Orphaned</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-600">
            {stats.orphanedDeployments}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-500">
              Preset Models
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {stats.totalModels}
            {stats.inactiveModels > 0 && (
              <span className="ml-2 text-base font-normal text-red-500">
                / {stats.inactiveModels} warning
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between py-6">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-zinc-600" />
              <div>
                <p className="font-medium">Deployments</p>
                <p className="text-sm text-zinc-500">
                  Search, filter, and manage deployment lifecycle.
                </p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href={`/${locale}/admin/deployments`}>Open</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-6">
            <div className="flex items-center gap-3">
              <Boxes className="h-5 w-5 text-zinc-600" />
              <div>
                <p className="font-medium">Models</p>
                <p className="text-sm text-zinc-500">
                  Manage preset model catalog and pricing references.
                </p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href={`/${locale}/admin/models`}>Open</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="flex items-center gap-3 py-5 text-sm text-zinc-500">
          <Settings2 className="h-4 w-4" />
          Pricing rules and other admin modules can be added as separate routes
          when needed.
        </CardContent>
      </Card>
    </div>
  );
}
