import { PageHeader } from "@/components/layout/PageHeader";

export function VerificationPage() {
  return (
    <section>
      <PageHeader
        title="Поверка СИ"
        description="Отдельная область для списка СИ, синхронизации с Arshin и ручной проверки сомнительных совпадений."
      />
      <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
        <p className="text-sm text-steel">
          В foundation-версии подготовлена только страница и общее место под review queue, `vri_id` и ссылку в Arshin.
        </p>
      </div>
    </section>
  );
}

