import { supabaseClient } from './supabase.js';

const tableBody = document.querySelector('#attendance-table tbody');
const dateFilter = document.getElementById('date-filter');
const logoutButton = document.getElementById('logout-button');

document.addEventListener('DOMContentLoaded', async () => {
  const now = new Date();
  const defaultMonth = now.toISOString().slice(0, 7);
  const monthPicker = document.getElementById('month-picker');
  const employeeFilter = document.getElementById('employee-filter');

  monthPicker.value = defaultMonth;

  await loadAndPopulateFilter();

  monthPicker.addEventListener('change', () => {
    const [year, month] = monthPicker.value.split('-');
    loadDetailedMonthlyView(parseInt(year), parseInt(month), employeeFilter.value);
  });

  employeeFilter.addEventListener('change', () => {
    const [year, month] = monthPicker.value.split('-');
    loadDetailedMonthlyView(parseInt(year), parseInt(month), employeeFilter.value);
  });

  loadDetailedMonthlyView(now.getFullYear(), now.getMonth() + 1, '');
});

async function loadAndPopulateFilter() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, full_name')
    .order('full_name');

  if (error) {
    console.error('Error loading employees:', error);
    return;
  }

  const employeeFilter = document.getElementById('employee-filter');
  employeeFilter.innerHTML = `<option value="">All Employees</option>`;
  
  data.forEach(profile => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.full_name;
    employeeFilter.appendChild(option);
  });
}

logoutButton.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = '/attendance-app/index.html';
});

async function loadDetailedMonthlyView(year, month, filterUserId = '') {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const startOfMonth = startDate.toLocaleDateString('en-CA');
  const endOfMonth = endDate.toLocaleDateString('en-CA');

  let query = supabaseClient
    .from('attendance_logs')
    .select(`
      attendance_date,
      timestamp,
      status,
      photo_url,
      user_id,
      profiles:user_id (
        full_name,
        email
      )
    `)
    .gte('attendance_date', startOfMonth)
    .lte('attendance_date', endOfMonth)
    .order('attendance_date', { ascending: true });
	

const { data: dlogs, error: dlogsError } = await query;

if (dlogsError) {
  console.error('Detailed view error:', dlogsError);
  return;
}

console.log('=== Raw Logs ===');
console.table(dlogs);

dlogs.forEach((row, index) => {
  console.log(`Row ${index + 1}:`);
  console.log('user_id:', row.user_id);
  console.log('attendance_date:', row.attendance_date);
  console.log('timestamp:', row.timestamp);
  console.log('status:', row.status);
  console.log('photo_url:', row.photo_url);
  console.log('profiles:', row.profiles);
});


  if (filterUserId) {
    query = query.eq('user_id', filterUserId);
  }

  const { data: logs, error: logsError } = await query;

  if (logsError) {
    console.error('Detailed view error:', logsError);
    return;
  }

  const selfiesMap = {};
await Promise.all(logs.map(async (row) => {
  if (row.photo_url) {
    const { data: signed, error } = await supabaseClient
      .storage
      .from('attendance-selfies')
      .createSignedUrl(row.photo_url, 60 * 60);

    if (signed?.signedUrl) {
      selfiesMap[`${row.attendance_date}|${row.user_id}`] = signed.signedUrl;
    } else {
      console.error(`❌ Failed to get signed URL for ${row.photo_url}`, error);
    }
  }
}));

  renderDetailedTable(logs, startOfMonth, endOfMonth, filterUserId, selfiesMap);
}

function renderDetailedTable(logs, startDateStr, endDateStr, selectedEmployeeId = '', selfiesMap = {}) {
  const table = document.getElementById('detailed-table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  const usersMap = new Map();
  logs.forEach(row => {
    if (row.profiles) {
      usersMap.set(row.user_id, {
        name: row.profiles.full_name || 'Unknown',
        email: row.profiles.email || '',
      });
    }
  });

  const users = Array.from(usersMap.entries()).sort((a, b) =>
    a[1].name.localeCompare(b[1].name)
  );

  const filteredUsers = selectedEmployeeId
    ? users.filter(([id]) => id === selectedEmployeeId)
    : users;

  const logsMap = {};
  logs.forEach(row => {
    const date = row.attendance_date;
    const userId = row.user_id;
    const profile = usersMap.get(userId);

    if (!profile) return;

    const key = userId;

    const time = new Date(row.timestamp).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const selfie = selfiesMap[`${date}|${userId}`] || null;
	console.log('SelfiesMap keys:', Object.keys(selfiesMap));


    if (!logsMap[date]) logsMap[date] = {};
    logsMap[date][key] = {
      status: row.status,
      time,
      selfie
    };
  });

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }

  thead.innerHTML = '<tr><th>Date</th>' +
    filteredUsers.map(([_, user]) => `<th>${user.name}<br><small>${user.email}</small></th>`).join('') +
    '</tr>';

  tbody.innerHTML = '';

  for (const date of dates) {
    const iso = date.toISOString().slice(0, 10);
    const row = document.createElement('tr');

    const dateLabel = date.toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short'
    });

    row.innerHTML = `<td>${dateLabel}</td>`;

    for (const [userId, user] of filteredUsers) {
      const entry = logsMap[iso]?.[userId];
      let cell = '';

      if (entry && entry.time) {
        const [hourStr, minuteStr, meridian] = entry.time.match(/(\d+):(\d+)\s?(AM|PM)/i).slice(1);
        let hours = parseInt(hourStr);
        const minutes = parseInt(minuteStr);
        const isPM = meridian.toUpperCase() === 'PM';
        if (hours === 12) hours = 0;
        const totalMinutes = (isPM ? 12 * 60 : 0) + hours * 60 + minutes;

        let icon = '🟢';
        let label = 'present';

        if (totalMinutes >= 11 * 60 + 30) {
          icon = '🔴';
          label = 'late';
        } else if (totalMinutes >= 11 * 60) {
          icon = '🟡';
          label = 'warning';
        }

        cell = `
          ${icon} ${label}<br>
          <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 2px;">
            <small>${entry.time}</small>
            ${entry.selfie 
              ? `<img src="${entry.selfie}" style="width: 64px; height: 64px; object-fit: cover; border-radius: 4px;" />`
              : ''
            }
          </div>
        `;
      }

      row.innerHTML += `<td style="text-align:center">${cell}</td>`;
    }

    tbody.appendChild(row);
  }

  populateEmployeeDropdown(users);
}

function populateEmployeeDropdown(users) {
  const dropdown = document.getElementById('employee-filter');
  const current = dropdown.value;

  dropdown.innerHTML = `<option value="">All Employees</option>` +
    users.map(([key, user]) =>
      `<option value="${key}" ${key === current ? 'selected' : ''}>${user.name}</option>`
    ).join('');
}

async function loadDashboard() {
  await loadDetailedMonthlyView();

  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (!user || userError) {
    alert('Access denied. Please log in.');
    window.location.href = '/attendance-app/index.html';
    return;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    alert('Access denied. Admins only.');
    window.location.href = '/index.html';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  loadLogs(today); // ← Assuming you still have this defined elsewhere
}


