import { render, screen } from "@testing-library/react";

import { PageHeader } from "@/components/layout/PageHeader";

describe("PageHeader", () => {
  it("renders title and description", () => {
    render(<PageHeader title="Главная" description="Описание" />);

    expect(screen.getByRole("heading", { name: "Главная" })).toBeInTheDocument();
    expect(screen.getByText("Описание")).toBeInTheDocument();
  });
});

