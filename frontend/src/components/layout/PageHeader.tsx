type PageHeaderProps = {
  title: string;
  description: string;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="mb-6 space-y-2">
      <h2 className="text-3xl font-semibold tracking-tight text-ink">{title}</h2>
      <p className="max-w-3xl text-sm text-steel">{description}</p>
    </header>
  );
}

