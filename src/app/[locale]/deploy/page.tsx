import { redirect } from "next/navigation";

export default async function DeployPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}#deploy`);
}
