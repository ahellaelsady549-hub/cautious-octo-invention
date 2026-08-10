import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Bookmark, Download, Pause, Play, Search, SkipForward, Target } from "lucide-react";
import {
  ayahAudioUrl,
  fetchSurah,
  fetchSurahList,
  reciters,
  ruqyahPlaylist,
  ruqyahReciterFolder,
  ruqyahSections,
  surahDownloadUrl,
} from "@/lib/quran";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/quran")({
  head: () => ({
    meta: [
      { title: "المصحف الكامل — أمتي" },
      {
        name: "description",
        content:
          "المصحف الشريف كاملًا نصًا وصوتًا بأصوات المنشاوي والحصري ومحمود البنا وعبد الباسط عبد الصمد مع تتبّع الورد اليومي.",
      },
      { property: "og:title", content: "المصحف الكامل — أمتي" },
      { property: "og:description", content: "اقرأ واستمع للمصحف كاملًا مع تتبّع وردك اليومي." },
    ],
  }),
  component: QuranPage,
});

const WARD_KEY = "emty-ward";

type Ward = { surah: number; ayah: number; target: number; today: number; date: string };

const loadWard = (): Ward => {
  const fallback: Ward = { surah: 1, ayah: 1, target: 20, today: 0, date: new Date().toDateString() };
  if (typeof window === "undefined") return fallback;
  try {
    const w = { ...fallback, ...JSON.parse(localStorage.getItem(WARD_KEY) ?? "{}") } as Ward;
    if (w.date !== new Date().toDateString()) return { ...w, today: 0, date: new Date().toDateString() };
    return w;
  } catch {
    return fallback;
  }
};

function QuranPage() {
  const { user } = useAuth();
  const [surahNo, setSurahNo] = useState(1);
  const [search, setSearch] = useState("");
  const [reciter, setReciter] = useState(reciters[0]!.folder);
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  const [continuous, setContinuous] = useState(true);
  const [ward, setWard] = useState<Ward>(loadWard);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: list } = useQuery({ queryKey: ["surahs"], queryFn: fetchSurahList, staleTime: Infinity });
  const { data: surah, isLoading } = useQuery({
    queryKey: ["surah", surahNo],
    queryFn: () => fetchSurah(surahNo),
    staleTime: Infinity,
  });

  useEffect(() => {
    const stored = loadWard();
    setWard(stored);
    setSurahNo(stored.surah);
  }, []);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("ward_progress")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const today = data.last_read_date === new Date().toISOString().slice(0, 10) ? data.ayahs_today : 0;
        setWard({
          surah: data.surah,
          ayah: data.ayah,
          target: data.daily_target,
          today,
          date: new Date().toDateString(),
        });
        setSurahNo(data.surah);
      });
  }, [user]);

  const persist = (next: Ward) => {
    setWard(next);
    localStorage.setItem(WARD_KEY, JSON.stringify(next));
    if (user) {
      void supabase.from("ward_progress").upsert({
        user_id: user.id,
        surah: next.surah,
        ayah: next.ayah,
        daily_target: next.target,
        ayahs_today: next.today,
        last_read_date: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      });
    }
  };

  const markRead = (ayah: number) => {
    persist({ ...ward, surah: surahNo, ayah, today: ward.today + 1, date: new Date().toDateString() });
    toast.success("تم تسجيل الآية في وردك اليوم");
  };

  const playAyah = (ayah: number) => {
    audioRef.current?.pause();
    const audio = new Audio(ayahAudioUrl(reciter, surahNo, ayah));
    audioRef.current = audio;
    setPlayingAyah(ayah);
    audio.onended = () => {
      if (continuous && surah && ayah < surah.meta.numberOfAyahs) playAyah(ayah + 1);
      else setPlayingAyah(null);
    };
    audio.onerror = () => {
      setPlayingAyah(null);
      toast.error("تعذّر تشغيل التلاوة، جرّب قارئًا آخر");
    };
    void audio.play();
  };

  const stop = () => {
    audioRef.current?.pause();
    setPlayingAyah(null);
  };

  useEffect(() => () => audioRef.current?.pause(), []);

  const filtered = useMemo(
    () => (list ?? []).filter((s) => s.name.includes(search) || String(s.number).includes(search)),
    [list, search],
  );

  const progress = Math.min(100, Math.round((ward.today / Math.max(1, ward.target)) * 100));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold gold-gradient-text">المصحف الكامل</h1>

      {/* Ward tracker */}
      <div className="surface mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-gold" />
            <h2 className="font-bold">تتبّع الورد اليومي</h2>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">الهدف اليومي</span>
            <select
              value={ward.target}
              onChange={(e) => persist({ ...ward, target: Number(e.target.value) })}
              className="rounded-lg border border-border bg-card px-2 py-1"
            >
              {[10, 20, 30, 50, 100, 200].map((v) => (
                <option key={v} value={v}>
                  {v} آية
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, backgroundImage: "var(--gradient-gold)" }}
          />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>
            قرأت اليوم {ward.today} من {ward.target} آية ({progress}%)
          </span>
          <button
            onClick={() => {
              setSurahNo(ward.surah);
              toast("انتقلنا إلى آخر موضع توقفت عنده");
            }}
            className="inline-flex items-center gap-1 text-gold"
          >
            <Bookmark className="h-3.5 w-3.5" /> آخر موضع: سورة {ward.surah} — آية {ward.ayah}
          </button>
        </div>
        {!user && (
          <p className="mt-3 text-xs text-muted-foreground">
            سجّل الدخول لحفظ وردك على كل أجهزتك (اختياري).
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* Surah list */}
        <aside className="surface h-fit p-4 lg:sticky lg:top-20">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن سورة..."
              className="w-full rounded-xl border border-border bg-background py-2.5 pr-9 pl-3 text-sm outline-none focus:border-gold"
            />
          </div>
          <div className="mt-3 max-h-[420px] space-y-1 overflow-y-auto pl-1">
            {filtered.map((s) => (
              <button
                key={s.number}
                onClick={() => {
                  setSurahNo(s.number);
                  stop();
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-right text-sm transition-colors ${
                  s.number === surahNo ? "bg-secondary text-gold" : "hover:bg-secondary/60"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted text-[11px]">
                    {s.number}
                  </span>
                  {s.name}
                </span>
                <span className="text-xs text-muted-foreground">{s.numberOfAyahs}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Reader */}
        <section className="surface p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <h2 className="flex items-center gap-2 font-display text-2xl">
              <BookOpen className="h-5 w-5 text-gold" />
              {surah?.meta.name ?? "..."}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={reciter}
                onChange={(e) => {
                  setReciter(e.target.value);
                  stop();
                }}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
              >
                {reciters.map((r) => (
                  <option key={r.id} value={r.folder}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => (playingAyah ? stop() : playAyah(1))}
                className="inline-flex items-center gap-2 rounded-lg hero-gradient px-3 py-1.5 text-sm font-semibold text-gold"
              >
                {playingAyah ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {playingAyah ? "إيقاف" : "استماع للسورة"}
              </button>
              {surahDownloadUrl(reciter, surahNo) ? (
                <a
                  href={surahDownloadUrl(reciter, surahNo)!}
                  download={`${surah?.meta.name ?? surahNo}.mp3`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-gold px-3 py-1.5 text-xs text-gold"
                >
                  <Download className="h-3.5 w-3.5" /> تحميل السورة
                </a>
              ) : (
                <span className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
                  التحميل غير متاح لهذا القارئ
                </span>
              )}
              <button
                onClick={() => setContinuous((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs ${
                  continuous ? "border-gold text-gold" : "border-border text-muted-foreground"
                }`}
              >
                <SkipForward className="h-3.5 w-3.5" /> تشغيل متتابع
              </button>

            </div>
          </div>

          {surahNo !== 9 && surahNo !== 1 && (
            <p className="quran-text mt-6 text-center text-gold">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </p>
          )}

          {isLoading && <p className="mt-6 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>}

          <div className="mt-4 space-y-2">
            {surah?.ayahs.map((a) => (
              <div
                key={a.number}
                className={`group rounded-2xl p-4 transition-colors ${
                  playingAyah === a.numberInSurah ? "bg-secondary" : "hover:bg-secondary/50"
                }`}
              >
                <p className="quran-text text-right">
                  {a.text}
                  <span className="mx-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gold text-sm text-gold">
                    {a.numberInSurah}
                  </span>
                </p>
                <div className="mt-2 flex gap-2 opacity-70 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => playAyah(a.numberInSurah)}
                    className="rounded-lg bg-muted px-3 py-1 text-xs"
                  >
                    استماع
                  </button>
                  <button
                    onClick={() => markRead(a.numberInSurah)}
                    className="rounded-lg bg-muted px-3 py-1 text-xs"
                  >
                    تسجيل في الورد
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <RuqyahPlayer />
    </div>
  );
}

/** الرقية الشرعية كاملة بصوت الشيخ محمد صديق المنشاوي */
function RuqyahPlayer() {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlist = useMemo(() => ruqyahPlaylist(), []);

  useEffect(() => () => audioRef.current?.pause(), []);

  const playFrom = (i: number) => {
    audioRef.current?.pause();
    const item = playlist[i];
    if (!item) {
      setPlaying(false);
      setPos(0);
      return;
    }
    const audio = new Audio(ayahAudioUrl(ruqyahReciterFolder, item.surah, item.ayah));
    audioRef.current = audio;
    setPos(i);
    setPlaying(true);
    audio.onended = () => playFrom(i + 1);
    audio.onerror = () => {
      setPlaying(false);
      toast.error("تعذّر تشغيل الرقية الآن");
    };
    void audio.play();
  };

  const toggleAll = () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    playFrom(pos);
  };

  const playSection = (id: string) => {
    const section = ruqyahSections.find((s) => s.id === id);
    if (!section) return;
    const idx = playlist.findIndex((p) => p.surah === section.surah && p.ayah === section.from);
    if (idx >= 0) playFrom(idx);
  };

  const current = playlist[pos];
  const activeSection = ruqyahSections.find(
    (s) => current && s.surah === current.surah && current.ayah >= s.from && current.ayah <= s.to,
  );

  return (
    <section className="surface mt-10 p-6">
      <h2 className="flex items-center gap-2 text-2xl font-bold gold-gradient-text">
        <BookOpen className="h-6 w-6 text-gold" /> الرقية الشرعية كاملة
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        بصوت الشيخ محمد صديق المنشاوي — تشغيل متواصل لآيات الرقية، أو ابدأ من أي مقطع.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={toggleAll}
          className="inline-flex items-center gap-2 rounded-xl hero-gradient px-5 py-2.5 text-sm font-semibold text-gold"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "إيقاف الرقية" : "تشغيل الرقية كاملة"}
        </button>
        {activeSection && (
          <span className="text-xs text-muted-foreground">
            يُتلى الآن: {activeSection.title} — آية {current?.ayah}
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {ruqyahSections.map((s) => (
          <button
            key={s.id}
            onClick={() => playSection(s.id)}
            className={`rounded-xl border px-3.5 py-1.5 text-xs transition-all ${
              activeSection?.id === s.id
                ? "border-gold bg-secondary text-gold"
                : "border-border bg-card hover:border-gold/50"
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>
    </section>
  );
}
