const STORAGE_KEYS = {
  workouts: "gritcore-workouts-v1",
  profile: "gritcore-profile-v1"
};

const EXERCISES = [
  "Push-ups",
  "Wide push-ups",
  "Diamond push-ups",
  "Knee push-ups",
  "Incline push-ups",
  "Decline push-ups",
  "Pike push-ups",
  "Sit-ups",
  "Crunches",
  "Bicycle crunches",
  "Squats",
  "Reverse lunges",
  "Glute bridges",
  "Calf raises",
  "Plank",
  "Side plank",
  "Mountain climbers",
  "Jumping jacks",
  "Burpees",
  "High knees",
  "Wall sit",
  "Yoga or stretching",
  "Walking or running",
  "Custom activity"
];

const ICONS = {
  "Push-ups": "↗",
  "Wide push-ups": "↗",
  "Diamond push-ups": "↗",
  "Knee push-ups": "↗",
  "Incline push-ups": "↗",
  "Decline push-ups": "↗",
  "Pike push-ups": "↗",
  "Sit-ups": "⌁",
  "Crunches": "⌁",
  "Bicycle crunches": "⌁",
  "Squats": "⌖",
  "Reverse lunges": "⌖",
  "Glute bridges": "⌖",
  "Calf raises": "⌖",
  "Plank": "◒",
  "Side plank": "◒",
  "Mountain climbers": "↟",
  "Jumping jacks": "✳",
  "Burpees": "↟",
  "High knees": "↟",
  "Wall sit": "◒",
  "Yoga or stretching": "✧",
  "Walking or running": "➜"
};

const DEFAULT_PROFILE = {
  name: "",
  age: null,
  weight: null,
  height: null,
  weeklyGoal: 3,
  focus: "general"
};

const toast = document.querySelector("#toast");
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
}

function readStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch (error) {
    console.error(`Could not read saved app data (${key}).`, error);
    showToast("Saved data could not be read. You can clear it in My details.");
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Could not save app data (${key}).`, error);
    showToast("Could not save data. Check available storage in your browser.");
    return false;
  }
}

let workouts = readStorage(STORAGE_KEYS.workouts, []);
let profile = { ...DEFAULT_PROFILE, ...readStorage(STORAGE_KEYS.profile, {}) };
if (!Array.isArray(workouts)) {
  console.error("Saved workout history has an invalid format.");
  workouts = [];
  showToast("Workout history could not be read and was reset.");
}

const exerciseSelect = document.querySelector("#exercise");
const cameraVideo = document.querySelector("#camera-video");
const poseCanvas = document.querySelector("#pose-canvas");
const poseContext = poseCanvas.getContext("2d");
const cameraFrame = document.querySelector(".camera-frame");
const cameraMessage = document.querySelector("#camera-message");
const cameraStartButton = document.querySelector("#camera-start");
const cameraStopButton = document.querySelector("#camera-stop");
const cameraSaveButton = document.querySelector("#camera-save");
const repCountOutput = document.querySelector("#rep-count");

let activeStream = null;
let poseLandmarker = null;
let poseLandmarkerPromise = null;
let animationFrame = 0;
let cameraStartedAt = 0;
let cameraRepCount = 0;
let cameraPhase = "top";
let lastRepAt = 0;
let pendingInstallPrompt = null;

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function workoutTotals(entries) {
  return entries.reduce((totals, entry) => {
    totals.reps += Number(entry.reps) * Number(entry.sets);
    totals.minutes += Number(entry.duration);
    return totals;
  }, { reps: 0, minutes: 0 });
}

function recentWeekEntries() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  return workouts.filter((entry) => new Date(entry.date).getTime() >= start.getTime());
}

function makeWorkoutRow(entry, shortDate = true) {
  const row = document.createElement("div");
  row.className = "workout-row";

  const dot = document.createElement("span");
  dot.className = "workout-dot";
  dot.setAttribute("aria-hidden", "true");
  dot.textContent = ICONS[entry.exercise] || "✦";

  const copy = document.createElement("div");
  copy.className = "workout-row-copy";
  const title = document.createElement("strong");
  title.textContent = entry.exercise;
  const details = document.createElement("span");
  details.textContent = `${entry.sets} set${Number(entry.sets) === 1 ? "" : "s"} · ${entry.reps} reps/set${entry.duration ? ` · ${entry.duration} min` : ""}`;
  copy.append(title, details);

  const date = document.createElement("span");
  date.className = "workout-date";
  date.textContent = shortDate ? formatShortDate(entry.date) : formatDate(entry.date);

  row.append(dot, copy, date);
  return row;
}

function renderDashboard() {
  const weekly = recentWeekEntries();
  const totals = workoutTotals(weekly);
  document.querySelector("#stat-workouts").textContent = String(weekly.length);
  document.querySelector("#stat-reps").textContent = String(totals.reps);
  document.querySelector("#stat-minutes").textContent = String(totals.minutes);
  document.querySelector("#stat-goal").textContent = String(profile.weeklyGoal || 3);
  const goalReached = weekly.length >= Number(profile.weeklyGoal || 3);
  document.querySelector("#goal-progress").textContent = goalReached
    ? "Weekly goal reached — great work!"
    : `${Math.max(0, Number(profile.weeklyGoal || 3) - weekly.length)} more to reach your goal`;

  const recent = [...workouts]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);
  const list = document.querySelector("#recent-workouts");
  list.replaceChildren(...recent.map((entry) => makeWorkoutRow(entry)));
  document.querySelector("#empty-recent").hidden = recent.length > 0;
}

function renderHistory() {
  const list = document.querySelector("#history-list");
  list.replaceChildren();
  const entries = [...workouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  document.querySelector("#empty-history").hidden = entries.length > 0;

  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "history-row";
    const main = document.createElement("div");
    main.className = "history-main";
    const dot = document.createElement("span");
    dot.className = "workout-dot";
    dot.setAttribute("aria-hidden", "true");
    dot.textContent = ICONS[entry.exercise] || "✦";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = entry.exercise;
    const details = document.createElement("span");
    details.textContent = `${entry.sets} set${Number(entry.sets) === 1 ? "" : "s"} · ${entry.reps} reps/set${entry.mode === "camera" ? " · camera count" : ""}`;
    copy.append(title, details);
    main.append(dot, copy);

    const meta = document.createElement("span");
    meta.className = "history-meta";
    meta.textContent = `${formatDate(entry.date)}${entry.duration ? ` · ${entry.duration} min` : ""}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete ${entry.exercise} workout`);
    remove.addEventListener("click", () => deleteWorkout(entry.id));

    row.append(main, meta, remove);
    if (entry.notes) {
      const note = document.createElement("span");
      note.className = "history-meta";
      note.textContent = entry.notes;
      row.append(note);
    }
    list.append(row);
  }
}

function renderProfile() {
  document.querySelector("#profile-name").value = profile.name || "";
  document.querySelector("#profile-age").value = profile.age ?? "";
  document.querySelector("#profile-weight").value = profile.weight ?? "";
  document.querySelector("#profile-height").value = profile.height ?? "";
  document.querySelector("#profile-goal").value = profile.weeklyGoal || 3;
  document.querySelector("#profile-focus").value = profile.focus || "general";
  const heightInMeters = Number(profile.height) / 100;
  const weight = Number(profile.weight);
  if (heightInMeters > 0 && weight > 0) {
    document.querySelector("#bmi-value").textContent = (weight / (heightInMeters * heightInMeters)).toFixed(1);
    document.querySelector("#bmi-caption").textContent = "BMI estimate (kg/m²). This is only a rough screening measure.";
  } else {
    document.querySelector("#bmi-value").textContent = "—";
    document.querySelector("#bmi-caption").textContent = "Add height and weight to see an optional BMI estimate.";
  }
}

function renderAll() {
  renderDashboard();
  renderHistory();
  renderProfile();
}

function showView(name) {
  const viewName = ["dashboard", "workout", "history", "profile"].includes(name) ? name : "dashboard";
  for (const view of document.querySelectorAll(".view")) {
    const active = view.id === `view-${viewName}`;
    view.classList.toggle("active", active);
    view.hidden = !active;
  }
  for (const button of document.querySelectorAll("[data-view]")) {
    button.classList.toggle("active", button.dataset.view === viewName);
  }
  if (location.hash !== `#${viewName}`) {
    history.replaceState(null, "", `#${viewName}`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function addWorkout({ exercise, sets, reps, duration, notes = "", mode = "manual" }) {
  const entry = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    exercise,
    sets: Number(sets),
    reps: Number(reps),
    duration: Number(duration),
    notes: String(notes).trim(),
    mode,
    date: new Date().toISOString()
  };
  workouts = [entry, ...workouts];
  if (!saveStorage(STORAGE_KEYS.workouts, workouts)) {
    workouts = workouts.slice(1);
    return false;
  }
  renderAll();
  showToast(`${exercise} saved to your workout history.`);
  return true;
}

function deleteWorkout(id) {
  const updated = workouts.filter((entry) => entry.id !== id);
  if (updated.length === workouts.length) return;
  workouts = updated;
  if (saveStorage(STORAGE_KEYS.workouts, workouts)) {
    renderAll();
    showToast("Workout removed from this device.");
  }
}

function fillExerciseOptions() {
  for (const name of EXERCISES) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    exerciseSelect.append(option);
  }
}

function setCameraMessage(message, kind = "") {
  cameraMessage.textContent = message;
  cameraMessage.classList.toggle("error", kind === "error");
  cameraMessage.classList.toggle("success", kind === "success");
}

function cameraExerciseKind() {
  return document.querySelector("#camera-exercise").value.toLowerCase().includes("push-up")
    ? "push-up"
    : "sit-up";
}

function angleAtJoint(first, joint, last) {
  const a = Math.atan2(first.y - joint.y, first.x - joint.x);
  const b = Math.atan2(last.y - joint.y, last.x - joint.x);
  let degrees = Math.abs((a - b) * 180 / Math.PI);
  if (degrees > 180) degrees = 360 - degrees;
  return degrees;
}

function visible(point) {
  return point && Number(point.visibility ?? 1) >= 0.45;
}

function chooseSide(landmarks, leftIds, rightIds) {
  const leftScore = leftIds.reduce((sum, id) => sum + Number(landmarks[id]?.visibility || 0), 0);
  const rightScore = rightIds.reduce((sum, id) => sum + Number(landmarks[id]?.visibility || 0), 0);
  return leftScore >= rightScore ? leftIds : rightIds;
}

function getExerciseAngle(landmarks, type) {
  const ids = type === "push-up"
    ? chooseSide(landmarks, [11, 13, 15], [12, 14, 16])
    : chooseSide(landmarks, [11, 23, 25], [12, 24, 26]);
  const points = ids.map((id) => landmarks[id]);
  if (!points.every(visible)) return null;
  return angleAtJoint(points[0], points[1], points[2]);
}

const POSE_CONNECTIONS = [
  [11, 13], [13, 15], [12, 14], [14, 16], [11, 12], [11, 23],
  [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]
];

function drawPose(landmarks) {
  if (!cameraVideo.videoWidth) return;
  if (poseCanvas.width !== cameraVideo.videoWidth || poseCanvas.height !== cameraVideo.videoHeight) {
    poseCanvas.width = cameraVideo.videoWidth;
    poseCanvas.height = cameraVideo.videoHeight;
  }
  poseContext.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
  poseContext.lineWidth = Math.max(3, poseCanvas.width / 180);
  poseContext.strokeStyle = "#83e0aa";
  poseContext.fillStyle = "#effff4";
  for (const [first, second] of POSE_CONNECTIONS) {
    if (!visible(landmarks[first]) || !visible(landmarks[second])) continue;
    poseContext.beginPath();
    poseContext.moveTo(landmarks[first].x * poseCanvas.width, landmarks[first].y * poseCanvas.height);
    poseContext.lineTo(landmarks[second].x * poseCanvas.width, landmarks[second].y * poseCanvas.height);
    poseContext.stroke();
  }
  for (const point of landmarks) {
    if (!visible(point)) continue;
    poseContext.beginPath();
    poseContext.arc(point.x * poseCanvas.width, point.y * poseCanvas.height, poseCanvas.width / 95, 0, Math.PI * 2);
    poseContext.fill();
  }
}

function updateRepCounter(angle, timestamp) {
  if (angle === null) {
    setCameraMessage("Keep your whole body in frame and turn to a side view so your shoulders, hips, elbows, and knees are visible.");
    return;
  }
  const kind = cameraExerciseKind();
  if (kind === "push-up") {
    if (cameraPhase === "top" && angle < 100) {
      cameraPhase = "bottom";
      setCameraMessage("Good depth. Push back up to complete the rep.");
    } else if (cameraPhase === "bottom" && angle > 155) {
      cameraPhase = "top";
      if (timestamp - lastRepAt > 650) {
        cameraRepCount += 1;
        lastRepAt = timestamp;
        repCountOutput.textContent = String(cameraRepCount);
      }
      setCameraMessage("Rep counted. Lower with control for your next rep.", "success");
    } else if (cameraPhase === "top") {
      setCameraMessage("Start from a straight-arm position, then lower with control.");
    }
  } else if (cameraPhase === "bottom" && angle < 100) {
    cameraPhase = "up";
    setCameraMessage("Nice. Lower back down to complete the rep.");
  } else if (cameraPhase === "up" && angle > 150) {
    cameraPhase = "bottom";
    if (timestamp - lastRepAt > 650) {
      cameraRepCount += 1;
      lastRepAt = timestamp;
      repCountOutput.textContent = String(cameraRepCount);
    }
    setCameraMessage("Rep counted. Sit up again when you're ready.", "success");
  } else if (cameraPhase === "bottom") {
    setCameraMessage("Start lying back with your shoulders and hips visible.");
  }
}

function detectFrame(timestamp) {
  if (!poseLandmarker || cameraVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    animationFrame = requestAnimationFrame(detectFrame);
    return;
  }
  try {
    const result = poseLandmarker.detectForVideo(cameraVideo, timestamp);
    const landmarks = result.landmarks?.[0];
    if (landmarks) {
      drawPose(landmarks);
      updateRepCounter(getExerciseAngle(landmarks, cameraExerciseKind()), timestamp);
    } else {
      poseContext.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
      setCameraMessage("Step back until your full body is visible in the camera.");
    }
  } catch (error) {
    console.error("Camera pose detection stopped unexpectedly.", error);
    setCameraMessage("Pose tracking stopped because of an error. Stop the camera and try again.", "error");
    stopCamera();
    return;
  }
  animationFrame = requestAnimationFrame(detectFrame);
}

async function loadPoseLandmarker() {
  if (poseLandmarker) return poseLandmarker;
  if (poseLandmarkerPromise) return poseLandmarkerPromise;
  poseLandmarkerPromise = (async () => {
    const visionVersion = "0.10.21";
    const visionModuleUrl = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${visionVersion}`;
    const vision = await import(visionModuleUrl);
    const fileset = await vision.FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${visionVersion}/wasm`
    );
    const options = {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.5
    };
    try {
      poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, options);
    } catch (gpuError) {
      console.warn("GPU pose tracking was unavailable; retrying on CPU.", gpuError);
      options.baseOptions.delegate = "CPU";
      poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, options);
    }
    return poseLandmarker;
  })();
  try {
    return await poseLandmarkerPromise;
  } catch (error) {
    poseLandmarkerPromise = null;
    throw error;
  }
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setCameraMessage("Camera access requires HTTPS or localhost. Open the app from a secure website or this computer's localhost.", "error");
    return;
  }
  cameraStartButton.disabled = true;
  setCameraMessage("Requesting camera access…");
  try {
    activeStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    cameraVideo.srcObject = activeStream;
    await cameraVideo.play();
    cameraFrame.classList.add("is-live");
    setCameraMessage("Loading on-device pose tracker. The first load needs an internet connection…");
    await loadPoseLandmarker();
    cameraStartedAt = Date.now();
    cameraRepCount = 0;
    lastRepAt = 0;
    cameraPhase = cameraExerciseKind() === "push-up" ? "top" : "bottom";
    repCountOutput.textContent = "0";
    cameraStopButton.disabled = false;
    cameraSaveButton.disabled = false;
    setCameraMessage("Tracker ready. Move through a comfortable range; the count is an estimate.");
    animationFrame = requestAnimationFrame(detectFrame);
  } catch (error) {
    console.error("Could not start the workout camera or pose tracker.", error);
    if (activeStream) {
      for (const track of activeStream.getTracks()) track.stop();
      activeStream = null;
    }
    cameraVideo.srcObject = null;
    cameraFrame.classList.remove("is-live");
    const message = error.name === "NotAllowedError"
      ? "Camera permission was denied. Allow camera access in your browser settings, then try again."
      : error.name === "NotFoundError"
        ? "No camera was found on this device."
        : "Could not start camera tracking. Check your connection and camera permission, then try again.";
    setCameraMessage(message, "error");
  } finally {
    cameraStartButton.disabled = false;
  }
}

function stopCamera() {
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  if (activeStream) {
    for (const track of activeStream.getTracks()) track.stop();
    activeStream = null;
  }
  cameraVideo.srcObject = null;
  cameraFrame.classList.remove("is-live");
  cameraStopButton.disabled = true;
  cameraSaveButton.disabled = true;
  cameraStartButton.disabled = false;
  poseContext.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
}

function saveCameraSet() {
  if (cameraRepCount < 1) {
    showToast("Complete at least one rep before saving this set.");
    return;
  }
  const duration = Math.max(0, Math.round((Date.now() - cameraStartedAt) / 60000));
  const exercise = document.querySelector("#camera-exercise").value;
  if (addWorkout({ exercise, sets: 1, reps: cameraRepCount, duration, mode: "camera" })) {
    stopCamera();
    setCameraMessage(`${cameraRepCount} reps saved. Great work!`, "success");
  }
}

function handleWorkoutSubmit(event) {
  event.preventDefault();
  const selected = exerciseSelect.value;
  const exercise = selected === "Custom activity"
    ? document.querySelector("#custom-exercise").value.trim()
    : selected;
  const sets = Number(document.querySelector("#sets").value);
  const reps = Number(document.querySelector("#reps").value);
  const duration = Number(document.querySelector("#duration").value);
  const notes = document.querySelector("#notes").value;
  if (!exercise) {
    showToast("Enter a name for your custom activity.");
    return;
  }
  if (!Number.isInteger(sets) || sets < 1 || !Number.isInteger(reps) || reps < 0 ||
    !Number.isInteger(duration) || duration < 0 || (reps === 0 && duration === 0)) {
    showToast("Add at least one rep or one minute, and check your sets and values.");
    return;
  }
  if (addWorkout({ exercise, sets, reps, duration, notes })) {
    event.target.reset();
    document.querySelector("#sets").value = "3";
    document.querySelector("#reps").value = "10";
    document.querySelector("#duration").value = "10";
    document.querySelector("#custom-exercise-wrap").hidden = true;
    showView("dashboard");
  }
}

function handleProfileSubmit(event) {
  event.preventDefault();
  const numberOrNull = (selector) => {
    const value = document.querySelector(selector).value;
    return value === "" ? null : Number(value);
  };
  profile = {
    name: document.querySelector("#profile-name").value.trim(),
    age: numberOrNull("#profile-age"),
    weight: numberOrNull("#profile-weight"),
    height: numberOrNull("#profile-height"),
    weeklyGoal: Number(document.querySelector("#profile-goal").value),
    focus: document.querySelector("#profile-focus").value
  };
  if (saveStorage(STORAGE_KEYS.profile, profile)) {
    renderAll();
    showToast("Your details have been saved on this device.");
  }
}

function clearAllData() {
  if (!window.confirm("Clear all workout history and profile details from this browser? This cannot be undone.")) return;
  try {
    localStorage.removeItem(STORAGE_KEYS.workouts);
    localStorage.removeItem(STORAGE_KEYS.profile);
  } catch (error) {
    console.error("Could not clear app data.", error);
    showToast("The browser could not clear app data. Try clearing this site's storage in browser settings.");
    return;
  }
  workouts = [];
  profile = { ...DEFAULT_PROFILE };
  renderAll();
  showToast("Workout history and details were cleared.");
}

function configureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingInstallPrompt = event;
    document.querySelector("#install-button").hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    pendingInstallPrompt = null;
    document.querySelector("#install-button").hidden = true;
    showToast("GRITCORE is installed and ready.");
  });
  document.querySelector("#install-button").addEventListener("click", async () => {
    if (!pendingInstallPrompt) {
      showToast("Use your browser menu and choose Add to Home Screen or Install app.");
      return;
    }
    pendingInstallPrompt.prompt();
    await pendingInstallPrompt.userChoice;
    pendingInstallPrompt = null;
    document.querySelector("#install-button").hidden = true;
  });
}

function initialize() {
  fillExerciseOptions();
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date()).toUpperCase();
  renderAll();

  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => showView(button.dataset.view));
  }
  for (const button of document.querySelectorAll("[data-go-workout]")) {
    button.addEventListener("click", () => showView("workout"));
  }
  for (const button of document.querySelectorAll("[data-view-link]")) {
    button.addEventListener("click", () => showView(button.dataset.viewLink));
  }
  for (const button of document.querySelectorAll("[data-quick-start]")) {
    button.addEventListener("click", () => {
      exerciseSelect.value = button.dataset.quickStart;
      showView("workout");
    });
  }
  exerciseSelect.addEventListener("change", () => {
    document.querySelector("#custom-exercise-wrap").hidden = exerciseSelect.value !== "Custom activity";
  });
  document.querySelector("#workout-form").addEventListener("submit", handleWorkoutSubmit);
  document.querySelector("#profile-form").addEventListener("submit", handleProfileSubmit);
  document.querySelector("#clear-data").addEventListener("click", clearAllData);
  cameraStartButton.addEventListener("click", startCamera);
  cameraStopButton.addEventListener("click", stopCamera);
  cameraSaveButton.addEventListener("click", saveCameraSet);
  document.querySelector("#camera-exercise").addEventListener("change", () => {
    cameraPhase = cameraExerciseKind() === "push-up" ? "top" : "bottom";
    cameraRepCount = 0;
    lastRepAt = 0;
    cameraStartedAt = activeStream ? Date.now() : 0;
    repCountOutput.textContent = "0";
    setCameraMessage("Exercise changed. Begin from the starting position for a fresh count.");
  });
  window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
  showView(location.hash.slice(1));
  configureInstallPrompt();

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Could not register the offline app shell.", error);
      showToast("Offline installation is unavailable in this browser session.");
    });
  }
}

initialize();
