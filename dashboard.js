import { supabaseClient } from './supabase.js';

const tableBody = document.querySelector('#attendance-table tbody');
const dateFilter = document.getElementById('date-filter');
const logoutButton = document.getElementById('logout-button');

document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const defaultMonth = now.toISOString().slice(0, 7); // YYYY-MM
  const monthPicker = document.getElementById('month-picker');
  monthPicker.value = defaultMonth;

  // Auto-load when month is changed
  monthPicker.addEventListener('change', () => {
    const selected = monthPicker.value;
    if (selected) {
      const [year, month] = selected.split('-');
      loadDetailedMonthlyView(parseInt(year), parseInt(month));
    }
  });

  // Initial load for current month
  loadDetailedMonthlyView(now.getFullYear(), now.getMonth() + 1);
});



logoutButton.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = '/index.html';
});

async function loadDetailedMonthlyView(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of the month

  const startOfMonth = startDate.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const endOfMonth = endDate.toLocaleDateString('en-CA');

  const { data: logs, error: logsError } = await supabaseClient
    .from('attendance_logs')
    .select(`
      attendance_date,
      timestamp,
      status,
      user_id,
      profiles:user_id (
        full_name,
        email
      )
    `)
    .gte('attendance_date', startOfMonth)
    .lte('attendance_date', endOfMonth)
    .order('attendance_date', { ascending: true });

  if (logsError) {
    console.error('Detailed view error:', logsError);
    return;
  }

  renderDetailedTable(logs, startOfMonth, endOfMonth);
}



function renderDetailedTable(logs, startDateStr, endDateStr) {
  const table = document.getElementById('detailed-table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  // Prepare unique user map: key = email|name
  const users = [...new Map(
    logs.map(row => {
      const name = row.profiles?.full_name || 'Unknown';
      const email = row.profiles?.email || '';
      const key = `${email}|${name}`;
      return [key, { name, email }];
    })
  )].sort((a, b) => a[1].name.localeCompare(b[1].name));

  // Group logs by date and user key
  const logsMap = {};
  logs.forEach(row => {
    const date = row.attendance_date;
    const name = row.profiles?.full_name || 'Unknown';
    const email = row.profiles?.email || '';
    const key = `${email}|${name}`;

    const time = new Date(row.timestamp).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    if (!logsMap[date]) logsMap[date] = {};
    logsMap[date][key] = {
      status: row.status,
      time
    };
  });

  // Generate list of dates
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }

  // Render table header
  thead.innerHTML = '<tr><th>Date</th>' +
    users.map(([_, user]) => `<th>${user.name}<br><small>${user.email}</small></th>`).join('') +
    '</tr>';

  // Render table rows
  tbody.innerHTML = '';

  for (const date of dates) {
    const iso = date.toISOString().slice(0, 10);
    const row = document.createElement('tr');

    const dateLabel = date.toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short'
    });

    row.innerHTML = `<td>${dateLabel}</td>`;

    for (const [key, user] of users) {
      const entry = logsMap[iso]?.[key];
      let cell = '';

      if (entry) {
        if (entry.status === 'present') {
          cell = `🟢 Present<br><small>${entry.time}</small>`;
        } else if (entry.status === 'late') {
          cell = `🔴 Late<br><small>${entry.time}</small>`;
        }
      }

      row.innerHTML += `<td style="text-align:center">${cell}</td>`;
    }

    tbody.appendChild(row);
  }
}



async function loadDashboard() {
await loadDetailedMonthlyView();	
  // Step 1: Get authenticated user
  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (!user || userError) {
    alert('Access denied. Please log in.');
    window.location.href = '/index.html';
    return;
  }

  // Step 2: Get profile to check if admin
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

  // Step 3: Load today's logs by default
  const today = new Date().toISOString().slice(0, 10);
  dateFilter.value = today;
  loadLogs(today);
}

async function loadLogs(date) {
  const { data: logs, error } = await supabaseClient
    .from('attendance_logs')
    .select(`
      id,
      user_id,
      lat,
      lng,
      photo_url,
      status,
      attendance_date,
      profiles (
        full_name
      )
    `)
    .eq('attendance_date', date)
    .order('attendance_date', { ascending: false });

  if (error) {
    console.error('❌ Failed to load attendance logs:', error);
    return;
  }

  renderLogs(logs);
}


function renderLogs(logs) {
  tableBody.innerHTML = '';
  logs.forEach(log => {
  const tr = document.createElement('tr');

  tr.innerHTML = `
    <td>${log.attendance_date}</td>
    <td>${log.profiles?.full_name || 'N/A'}</td>
    <td class="${log.status === 'late' ? 'status-late' : 'status-present'}">
  ${log.status === 'late' ? '🔴 Late' : '🟢 Present'}
</td>
    <td><a href="${log.photo_url}" target="_blank">View</a></td>
  `;

  tableBody.appendChild(tr);
});
}



dateFilter.addEventListener('change', (e) => {
  const selectedDate = e.target.value;
  if (selectedDate) loadLogs(selectedDate);
});

loadDashboard();
