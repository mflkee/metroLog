import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { fetchArshinStatus } from "@/api/arshin";
import { useAuthStore } from "@/store/auth";

/**
 * The Arshin health dot of the top bar: it polls the probe and shows whether the service is
 * reachable. It lives in the shell's status slot, so the top bar itself stays generic.
 */
export function ArshinStatusIndicator() {
  const token = useAuthStore((state) => state.token);
  const [isArshinProbeSlow, setIsArshinProbeSlow] = useState(false);
  const arshinStatusQuery = useQuery({
    queryKey: ["arshin-status"],
    queryFn: () => fetchArshinStatus(token ?? ""),
    enabled: Boolean(token),
    staleTime: 4 * 1000,
    refetchInterval: 5 * 1000,
  });

  useEffect(() => {
    if (arshinStatusQuery.fetchStatus !== "fetching") {
      setIsArshinProbeSlow(false);
      return undefined;
    }

    setIsArshinProbeSlow(false);
    const timeoutId = window.setTimeout(() => {
      setIsArshinProbeSlow(true);
    }, 2_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [arshinStatusQuery.fetchStatus]);

  const indicator = isArshinProbeSlow
    ? {
        title: "Аршин не отвечает",
        dotClassName: "bg-[var(--danger)]",
        toneClassName: "text-[var(--danger)]",
      }
    : arshinStatusQuery.isLoading
      ? {
          title: "Проверяем Аршин",
          dotClassName: "bg-steel/45",
          toneClassName: "text-steel",
        }
      : arshinStatusQuery.isError || arshinStatusQuery.data?.available === false
        ? {
            title: "Аршин недоступен",
            dotClassName: "bg-[var(--danger)]",
            toneClassName: "text-[var(--danger)]",
          }
        : {
            title: "Аршин доступен",
            dotClassName: "bg-[var(--success)]",
            toneClassName: "text-[var(--success)]",
          };

  return (
    <div
      aria-label={indicator.title}
      className={[
        "hidden shrink-0 items-center gap-2 text-xs font-medium sm:inline-flex",
        indicator.toneClassName,
      ].join(" ")}
      title={indicator.title}
    >
      <span
        aria-hidden="true"
        className={["h-2 w-2 rounded-full", indicator.dotClassName].join(" ")}
      />
      <span className="whitespace-nowrap">Аршин</span>
    </div>
  );
}
