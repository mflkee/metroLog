import { PageHeader } from "@/components/layout/PageHeader";

export function EventsPage() {
  return (
    <section>
      <PageHeader
        title="Журнал событий"
        description="Audit-style журнал изменений по оборудованию, заметкам, SI и ремонтам."
      />
      <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
        <p className="text-sm text-steel">
          Здесь будет глобальный лог с фильтрацией, поиском и правами просмотра по ролям.
        </p>
      </div>
    </section>
  );
}

