"use client";

import { useEffect, useState } from "react";

type CurrentTime = {
  hour: number;
  minute: number;
  totalMinutes: number;
};

function getNow(): CurrentTime {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  return { hour, minute, totalMinutes: hour * 60 + minute };
}

export function useCurrentTime(): CurrentTime {
  const [time, setTime] = useState<CurrentTime>(getNow);

  useEffect(() => {
    const id = setInterval(() => setTime(getNow()), 30_000);
    return () => clearInterval(id);
  }, []);

  return time;
}
