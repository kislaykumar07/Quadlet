/* Quadlet explainer player: the "how to use Quadlet" video as slides + voiceover.
   (A single MP4 can't be deployed from here — the file-upload path caps
   arguments well below video size — so the video ships as its slides and
   narration clips, which play back exactly like the video. The full MP4 is
   also built for sharing; see ~/workspace/quadlet-video/.)
   Modelled on XenMind's initWatchPlayer. No-op on pages without the player. */
const WATCH_SLIDES = [
  ["slide1", "Meet Quadlet"],
  ["slide2", "Tell Quadlet your trip"],
  ["slide3", "Four agents, in parallel"],
  ["slide4", "The Synthesizer"],
  ["slide5", "Your final plan"],
  ["slide6", "Manage it your way"],
  ["slide7", "Ask Mili"],
  ["slide8", "Try it free"],
];
/* Slide durations (narration + a half-second tail) drive the slow-zoom length. */
const WATCH_DURATIONS = [10.1, 15.02, 15.788, 14.228, 11.852, 11.708, 13.58, 9.092];

export function initWatch() {
  const img = document.getElementById("watch-img");
  const audio = document.getElementById("watch-audio");
  if (!img || !audio) return;
  let idx = 0, playing = false;
  const playBtn = document.getElementById("watch-play");
  const bigPlay = document.getElementById("watch-bigplay");
  const count = document.getElementById("watch-count");
  const title = document.getElementById("watch-title");
  const bar = document.getElementById("watch-bar");
  const show = (i, animate = true) => {
    idx = Math.max(0, Math.min(WATCH_SLIDES.length - 1, i));
    count.textContent = `${idx + 1} / ${WATCH_SLIDES.length}`;
    title.textContent = WATCH_SLIDES[idx][1];
    bar.style.width = "0%";
    const want = `/watch/${WATCH_SLIDES[idx][0]}.mp3`;
    if (audio.getAttribute("src") !== want) { audio.src = want; audio.load(); }
    const apply = () => {
      img.onload = () => {
        img.classList.remove("swap");
        title.classList.remove("swapT");
        img.classList.remove("kb"); void img.offsetWidth;
        img.style.animationDuration = WATCH_DURATIONS[idx] + "s";
        img.style.animationPlayState = playing ? "running" : "paused";
        img.classList.add("kb");
      };
      img.src = `/watch/${WATCH_SLIDES[idx][0]}.jpg`;
    };
    if (!animate) {
      img.style.animationDuration = WATCH_DURATIONS[0] + "s";
      img.style.animationPlayState = "paused";
      img.classList.add("kb");
      apply(); return;
    }
    img.classList.add("swap"); title.classList.add("swapT");
    setTimeout(apply, 220);
  };
  const paint = () => {
    playBtn.textContent = playing ? "❚❚ Pause" : (idx === WATCH_SLIDES.length - 1 && audio.ended ? "↻ Replay" : "▶ Play");
    bigPlay.style.display = playing ? "none" : "block";
  };
  const play = () => {
    if (idx === WATCH_SLIDES.length - 1 && audio.ended) show(0);
    audio.play().catch(() => {});
    img.style.animationPlayState = "running";
    playing = true; paint();
  };
  const pause = () => { audio.pause(); img.style.animationPlayState = "paused"; playing = false; paint(); };
  playBtn.addEventListener("click", () => (playing ? pause() : play()));
  bigPlay.addEventListener("click", play);
  document.getElementById("watch-prev").addEventListener("click", () => { show(idx - 1); if (playing) play(); });
  document.getElementById("watch-next").addEventListener("click", () => { show(idx + 1); if (playing) play(); });
  audio.addEventListener("timeupdate", () => {
    if (audio.duration) bar.style.width = (audio.currentTime / audio.duration * 100) + "%";
  });
  audio.addEventListener("ended", () => {
    if (idx < WATCH_SLIDES.length - 1) { show(idx + 1); if (playing) play(); }
    else { playing = false; paint(); }
  });
  show(0, false);
  paint();
}
