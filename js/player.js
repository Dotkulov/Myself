const listEl = document.getElementById('track-list');
const listError = document.getElementById('list-error');
const audio = document.getElementById('audio');

const playBtns = document.querySelectorAll('.js-play');
const prevBtns = [document.getElementById('prev-btn'), document.getElementById('fs-prev')];
const nextBtns = [document.getElementById('next-btn'), document.getElementById('fs-next')];

const progressEls = [document.getElementById('progress'), document.getElementById('fs-progress')];
const currentEls = [document.getElementById('current-time'), document.getElementById('fs-current')];
const durationEls = [document.getElementById('duration'), document.getElementById('fs-duration')];

const volume = document.getElementById('volume');
const nowEl = document.getElementById('now');
const nowTitle = document.getElementById('now-title');
const nowArtist = document.getElementById('now-artist');
const nowCover = document.getElementById('now-cover');

const fs = document.getElementById('fs');
const fsClose = document.getElementById('fs-close');
const fsCover = document.getElementById('fs-cover');
const fsTitle = document.getElementById('fs-title');
const fsArtist = document.getElementById('fs-artist');

let tracks = [];
let currentId = null;
let seeking = false;

const GITHUB_USER = 'Dotkulov';
const GITHUB_REPO = 'Myself';
const MUSIC_FOLDER = 'music';

const savedVolume = localStorage.getItem('player-volume');
if (savedVolume !== null) volume.value = savedVolume;
audio.volume = Number(volume.value);

function paintSlider(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const span = max - min || 1;
  input.style.setProperty('--fill', `${((Number(input.value) - min) / span) * 100}%`);
}
[volume, ...progressEls].forEach(paintSlider);

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function showListError(text) {
  listError.textContent = text;
  listError.hidden = !text;
}

function paintCover(element, path) {
  const ok = path && path.startsWith('data:image') || path && path.startsWith('http');
  element.style.backgroundImage = ok ? `url("${path}")` : '';
  element.classList.toggle('has-image', Boolean(ok));
}

function setPlaying(isPlaying) {
  playBtns.forEach((btn) => {
    btn.querySelector('.icon-play').hidden = isPlaying;
    btn.querySelector('.icon-pause').hidden = !isPlaying;
    btn.setAttribute('aria-label', isPlaying ? 'Пауза' : 'Воспроизвести');
  });
}

function currentIndex() {
  return tracks.findIndex((t) => t.id === currentId);
}

function updateNavButtons() {
  const i = currentIndex();
  const has = i !== -1;
  prevBtns.forEach((b) => { b.disabled = !has || tracks.length < 2; });
  nextBtns.forEach((b) => { b.disabled = !has || tracks.length < 2; });
}

function renderNowPlaying(track) {
  const title = track ? track.title : 'Ничего не выбрано';
  const artist = track ? track.artist : 'Выберите трек из списка';
  nowTitle.textContent = title;
  nowArtist.textContent = artist;
  fsTitle.textContent = title;
  fsArtist.textContent = artist;
  paintCover(nowCover, track && track.coverUrl);
  paintCover(fsCover, track && track.coverUrl);
}

function renderList() {
  listEl.replaceChildren();
  if (!tracks.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Пока нет треков';
    listEl.appendChild(empty);
    return;
  }

  tracks.forEach((track) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'track';
    if (track.id === currentId) button.classList.add('is-active');

    const cover = document.createElement('div');
    cover.className = 'cover';
    paintCover(cover, track.coverUrl);

    const meta = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'track-title';
    title.textContent = track.title;
    const artist = document.createElement('div');
    artist.className = 'track-artist';
    artist.textContent = track.artist;
    meta.append(title, artist);

    button.append(cover, meta);
    button.addEventListener('click', () => selectTrack(track));
    listEl.appendChild(button);
  });
}

async function selectTrack(track) {
  if (currentId === track.id) {
    togglePlayback();
    return;
  }

  currentId = track.id;
  renderNowPlaying(track);
  renderList();
  updateNavButtons();
  playBtns.forEach((b) => { b.disabled = false; });
  progressEls.forEach((p) => { p.disabled = false; p.value = '0'; paintSlider(p); });
  currentEls.forEach((el) => { el.textContent = '0:00'; });
  durationEls.forEach((el) => { el.textContent = '0:00'; });
  showListError('');
  audio.src = track.audioUrl;

  try {
    await audio.play();
  } catch (error) {
    showListError('Браузер не дал начать воспроизведение. Нажмите play ещё раз.');
  }
}

function step(delta) {
  if (tracks.length < 2) return;
  const i = currentIndex();
  if (i === -1) return;
  selectTrack(tracks[(i + delta + tracks.length) % tracks.length]);
}

function togglePlayback() {
  if (!audio.src) return;
  if (audio.paused) {
    audio.play().catch(() => showListError('Не удалось воспроизвести трек'));
  } else {
    audio.pause();
  }
}

playBtns.forEach((b) => b.addEventListener('click', togglePlayback));
prevBtns.forEach((b) => b.addEventListener('click', () => step(-1)));
nextBtns.forEach((b) => b.addEventListener('click', () => step(1)));

audio.addEventListener('play', () => setPlaying(true));
audio.addEventListener('pause', () => setPlaying(false));
audio.addEventListener('ended', () => {
  setPlaying(false);
  if (tracks.length > 1) step(1);
});
audio.addEventListener('loadedmetadata', () => {
  durationEls.forEach((el) => { el.textContent = formatTime(audio.duration); });
});
audio.addEventListener('timeupdate', () => {
  currentEls.forEach((el) => { el.textContent = formatTime(audio.currentTime); });
  if (!seeking && Number.isFinite(audio.duration) && audio.duration > 0) {
    const value = String((audio.currentTime / audio.duration) * 100);
    progressEls.forEach((p) => { p.value = value; paintSlider(p); });
  }
});
audio.addEventListener('error', () => {
  if (audio.getAttribute('src')) showListError('Не удалось загрузить аудиофайл');
});

progressEls.forEach((input) => {
  input.addEventListener('input', () => {
    seeking = true;
    if (Number.isFinite(audio.duration)) {
      audio.currentTime = (Number(input.value) / 100) * audio.duration;
      currentEls.forEach((el) => { el.textContent = formatTime(audio.currentTime); });
      progressEls.forEach((p) => { p.value = input.value; paintSlider(p); });
    }
  });
  input.addEventListener('change', () => { seeking = false; });
});

volume.addEventListener('input', () => {
  audio.volume = Number(volume.value);
  localStorage.setItem('player-volume', volume.value);
  paintSlider(volume);
});

function openFullscreen() {
  fs.hidden = false;
  document.body.style.overflow = 'hidden';
  fsClose.focus();
}
function closeFullscreen() {
  fs.hidden = true;
  document.body.style.overflow = '';
  nowEl.focus();
}
nowEl.addEventListener('click', openFullscreen);
nowEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openFullscreen();
  }
});
fsClose.addEventListener('click', closeFullscreen);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !fs.hidden) closeFullscreen();
});

async function loadTracksFromGitHub() {
  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${MUSIC_FOLDER}`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) throw new Error('GitHub API вернул ошибку. Проверьте настройки репозитория.');
    
    const files = await response.json();
    const mp3Files = files.filter(file => file.name.toLowerCase().endsWith('.mp3'));
    
    if (mp3Files.length === 0) {
        listEl.innerHTML = '<p class="empty">В папке music нет MP3 файлов.</p>';
        return;
    }

    tracks = [];
    
    await Promise.all(mp3Files.map(async (file) => {
      const audioUrl = file.download_url;
      try {
        const meta = await readId3FromUrl(audioUrl);
        
        let coverUrl = '';
        if (meta.cover) {
            const blob = new Blob([meta.cover.data], { type: meta.cover.mime });
            coverUrl = URL.createObjectURL(blob);
        }

        tracks.push({
          id: file.name,
          title: meta.title || file.name.replace('.mp3', ''),
          artist: meta.artist || 'Неизвестный исполнитель',
          audioUrl: audioUrl,
          coverUrl: coverUrl
        });
      } catch (e) {
        console.warn(`Не удалось прочитать теги для ${file.name}`, e);
        tracks.push({
          id: file.name,
          title: file.name.replace('.mp3', ''),
          artist: 'Неизвестный исполнитель',
          audioUrl: audioUrl,
          coverUrl: ''
        });
      }
    }));

    tracks.sort((a, b) => a.id.localeCompare(b.id));
    
    showListError('');
    renderList();
  } catch (error) {
    showListError(error.message || 'Не удалось загрузить каталог');
    listEl.innerHTML = '';
  }
}
loadTracksFromGitHub();
