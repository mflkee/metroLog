import { render, screen } from "@testing-library/react";

import { AppVersionBadge } from "@/components/layout/AppVersionBadge";
import { APP_VERSION } from "@/lib/appVersion";

describe("AppVersionBadge", () => {
  it("shows the version and the beta channel", () => {
    render(<AppVersionBadge />);

    expect(screen.getByText(`v${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.getByTestId("app-stage")).toHaveTextContent("beta");
    expect(screen.getByTitle(new RegExp(`metroLog ${APP_VERSION.replace(/\./g, "\\.")} \\(beta\\)`))).toBeInTheDocument();
  });

  it("invokes onClick when pressed", () => {
    let clicked = 0;
    render(<AppVersionBadge onClick={() => (clicked += 1)} />);

    screen.getByRole("button").click();
    expect(clicked).toBe(1);
  });
});
