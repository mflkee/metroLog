import { PageHeader } from "@/components/layout/PageHeader";

export function SettingsPage() {
  return (
    <section>
      <PageHeader
        title="Настройки"
        description="Foundation-область под системные настройки, словари и административные функции."
      />
      <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
        <p className="text-sm text-steel">
          На следующих этапах здесь появятся справочники, системные параметры и будущие role-based разделы.
        </p>
      </div>
    </section>
  );
}

