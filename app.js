import { supabaseClient } from './supabase.js';

const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const statusDiv = document.getElementById('status');

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

import { CONFIG } from './config.js';

const OFFICE_LAT = CONFIG.OFFICE_LAT;
const OFFICE_LNG = CONFIG.OFFICE_LNG;
const MAX_DISTANCE_METERS = CONFIG.MAX_DISTANCE_METERS;

document.getElementById('login-button').addEventListener('click', login);
document.getElementById('logout-button').addEventListener('click', logout);
document.getElementById('mark-button').addEventListener('click', markAttendance);

export async function getDeviceId() {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  return result.visitorId; // This is your unique device ID
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { error: signInError } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    alert(signInError.message);
    return;
  }

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  if (!user) {
    alert("Login failed. Try again.");
    return;
  }

  // ✅ Load FingerprintJS
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  const currentDeviceId = result.visitorId;

  console.log("🔍 Generated Device ID:", currentDeviceId);

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('device_id')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error("Failed to fetch profile:", profileError);
    return;
  }

  console.log("🧾 Profile from DB:", profile);

  if (!profile.device_id) {
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({ device_id: currentDeviceId })
      .eq('id', user.id);

    if (updateError) {
      console.error("❌ Failed to update device_id:", updateError);
    } else {
      console.log("✅ Device ID saved to Supabase.");
    }
  } else {
    console.log("✅ Device already bound. Skipping update.");
  }

  loadApp();
}


async function logout() {
  await supabaseClient.auth.signOut();
  location.reload();
}

async function loadApp() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();
  if (!session) return;

  loginSection.style.display = 'none';
  appSection.style.display = 'block';



  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => video.srcObject = stream)
    .catch(err => {
      statusDiv.innerText = 'Camera access denied';
    });



}

function showOverlay(message, refreshAfter = true, delay = 4000) {
  const overlay = document.getElementById("attendance-overlay");
  const messageBox = document.getElementById("overlay-message");

  messageBox.textContent = message;
  overlay.classList.remove("hidden");

  if (refreshAfter) {
    setTimeout(() => {
      location.reload();  // 🔁 Reload the entire page
    }, delay);
  }
}




function getDistanceFromOffice(lat, lng) {
  const toRad = deg => deg * (Math.PI / 180);
  const R = 6371000; // Earth radius in meters

  const dLat = toRad(lat - OFFICE_LAT);
  const dLng = toRad(lng - OFFICE_LNG);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(OFFICE_LAT)) *
            Math.cos(toRad(lat)) *
            Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return parseFloat(distance.toFixed(2)); // round to 2 decimal meters
}


async function markAttendance() {
const markButton = document.getElementById('mark-button');
  markButton.disabled = true;
  markButton.style.opacity = '0.2';
  statusDiv.innerText = 'Marking Attendance...';

// Check camera permission
  try {
    const cameraPerm = await navigator.permissions.query({ name: 'camera' });
    if (cameraPerm.state === 'denied') {
      showOverlay(`❌ Camera access is currently blocked.

👉 To enable it:
1. Click the 🔒 icon near the address bar.
2. Find "Camera" and set it to "Allow".
3. Reload the page.`);
      return;
    }
  } catch (err) {
    console.warn('Camera permissions query failed:', err);
  }

// Check location permission (optional pre-check)
  try {
    const geoPerm = await navigator.permissions.query({ name: 'geolocation' });
    if (geoPerm.state === 'denied') {
      showOverlay(`❌ Location access is currently blocked.

👉 To enable it:
1. Click the 🔒 icon near the address bar.
2. Find "Location" and set it to "Allow".
3. Reload the page.`);
      return;
    }
  } catch (err) {
    console.warn('Geolocation permission query not supported.');
  }

  // ✅ Step 1: Actually request location and wait
  let pos;
  try {
    pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000
      });
    });
  } catch (err) {
    showOverlay(`❌ Failed to access location.

👉 To fix:
1. Ensure location is enabled on your device.
2. Grant location permission to the browser.
3. Reload the page.

Error: ${err.message}`);
    return;
  }


if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  showOverlay("❌ Camera not supported on this device.");
  return;
}


  // Step 1: Get location

  const { latitude, longitude } = pos.coords;

  // Step 2: Geofencing
  const distance = getDistanceFromOffice(latitude, longitude);
  const rounded = Math.round(distance);
  if (distance > MAX_DISTANCE_METERS) {
    showOverlay(`❌ You're ${rounded} meters away from office. Move closer.`);
    return;
  }

  // Step 3: Get current user
  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    showOverlay('❌ Not logged in. Please login again.');
    return;
  }

const currentDeviceId = await getDeviceId();

const { data: profile } = await supabaseClient
  .from('profiles')
  .select('device_id')
  .eq('id', user.id)
  .single();

if (profile.device_id && profile.device_id !== currentDeviceId) {
  showOverlay("❌ This device is not registered for attendance. Contact admin.");
  return;
}

// Optional: If device_id not set (first time)
if (!profile.device_id) {
  await supabaseClient
    .from('profiles')
    .update({ device_id: currentDeviceId })
    .eq('id', user.id);
}

  // Step 4: Check duplicate attendance
  //const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const now = new Date();
const localDate = now.toLocaleDateString('en-CA'); // ✅ YYYY-MM-DD

const { data: existing, error: checkError } = await supabaseClient
  .from('attendance_logs')
  .select('id')
  .eq('user_id', user.id)
  .eq('attendance_date', localDate); // ✅ use localDate here

  if (checkError) {
    console.error('Check failed:', checkError);
    showOverlay('❌ Could not check attendance. Try again.');
    return;
  }

  if (existing && existing.length > 0) {
    showOverlay('✅ Attendance already marked today.');
    return;
  }

if (video.videoWidth === 0 || video.videoHeight === 0) {
  showOverlay("❌ Camera not ready. Please wait and try again.");
  return;
}

  // Step 5: Capture photo
  statusDiv.innerText = 'Capturing...';
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));

if (!blob || blob.size === 0) {
  showOverlay("❌ Failed to capture a valid photo. Try again.");
  return;
}



  // Step 6: Upload to storage
  const filePath = `${user.id}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabaseClient.storage
    .from('attendance-selfies')
    .upload(filePath, blob);

  if (uploadError) {
    console.error(uploadError);
    showOverlay('❌ Failed to upload photo.');
    return;
  }

const { data: urlData } = supabaseClient
  .storage
  .from('attendance-selfies')
  .getPublicUrl(filePath);

  // Step 7: Insert attendance record
  

const day = now.getDay(); // 0 = Sunday
const hours = now.getHours();
// local time
const minutes = now.getMinutes();


let status = 'present';
if (day !== 0 && (hours > 11 || (hours === 11 && minutes > 0))) {
  status = 'late';
}

console.log('Local time:', now.toString());
console.log('Hours:', hours);
console.log('Minutes:', minutes);
console.log('Day of week:', day);
console.log('Status being inserted:', status);
console.log('Local date:', localDate);

  const { error: insertError } = await supabaseClient.from('attendance_logs').insert({
    user_id: user.id,
    lat: latitude,
    lng: longitude,
    photo_url: filePath,
    status,
    attendance_date: localDate
  });

  if (insertError) {
    console.error('Insert error:', insertError);

    // ❗ Auto-delete uploaded image on failure
    await supabaseClient.storage
      .from('attendance-selfies')
      .remove([filePath]);

    if (insertError.code === '23505') {
      showOverlay('✅ Attendance already marked today.');
    } else {
      showOverlay('❌ Failed to mark attendance.');
    }

    return;
  }

  showOverlay(`✅ Attendance marked! You were ${rounded} meters from office.`);
}

loadApp();
