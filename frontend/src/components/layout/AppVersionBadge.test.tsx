import { render, screen } from "@testing-library/react";

import { AppVersionBadge } from "@/components/layout/AppVersionBadge";
import { APP_VERSION } from "@/lib/appVersion";

describe("AppVersionBadge", () => {
  it("shows the version and the beta channel", () => {
    render(<AppVersionBadge />);

    expect(screen.getByText(`v${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.getByTestId("app-stage")).toHaveTextContent("beta");
    expect(screen.getByTitle(`metroLog ${APP_VERSION} (beta)`)).toBeInTheDocument();
  });
});
