import { PageHeader } from "@/components/layout/PageHeader";

export function ProfilePage() {
  return (
    <section>
      <PageHeader
        title="Профиль"
        description="Минимальная учетная страница с базовой информацией о пользователе и будущими ролями."
      />
      <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
        <dl className="grid gap-3 text-sm text-steel">
          <div>
            <dt className="font-semibold text-ink">Пользователь</dt>
            <dd>demo@metrolog.local</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Роль</dt>
            <dd>Foundation placeholder</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

