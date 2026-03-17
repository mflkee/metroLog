import { PageHeader } from "@/components/layout/PageHeader";

export function RepairsPage() {
  return (
    <section>
      <PageHeader
        title="Ремонты"
        description="Раздел будет разбит на активные и архивные ремонты с поиском и фильтрами."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
          <h3 className="text-lg font-semibold text-ink">Активные</h3>
          <p className="mt-2 text-sm text-steel">Будущая рабочая очередь для текущих ремонтов.</p>
        </div>
        <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
          <h3 className="text-lg font-semibold text-ink">Архивные</h3>
          <p className="mt-2 text-sm text-steel">Будущая история завершенных и закрытых ремонтов.</p>
        </div>
      </div>
    </section>
  );
}

