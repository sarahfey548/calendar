// Desk Calendar backend (Google Apps Script)
// Reads your Google Calendar and Google Tasks and hands them to the display page as JSON.
//
// Your secret lives in Project Settings > Script Properties (name: SECRET), not in this file,
// so you can paste in new versions of this code without re-entering it.

// Default number of days of events to send (today included).
const DAYS_AHEAD = 14;

// Calendars you don't own (like one someone shared with you) show in light gray.
// If a calendar still shows black and you want it gray, add its name here, e.g. ['Dani'].
const OTHER_CALENDARS = [];

function getSecret() {
  const s = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!s) throw new Error('No SECRET set in Script Properties');
  return s;
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.key !== getSecret()) return json({ error: 'unauthorized' });
    return json(getData(p.days, p.list));
  } catch (err) {
    return json({ error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.key !== getSecret()) return json({ error: 'unauthorized' });

    if (body.action === 'complete' && body.id) {
      Tasks.Tasks.patch({ status: 'completed' }, body.listId || '@default', body.id);
    } else if (body.action === 'add' && body.title) {
      const list = body.list && body.list !== 'all' ? body.list : '@default';
      Tasks.Tasks.insert({ title: String(body.title).slice(0, 200) }, list);
    }
    return json(getData(body.days, body.list));
  } catch (err) {
    return json({ error: String(err) });
  }
}

function cleanText(s, max) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function getData(days, list) {
  days = Math.min(Math.max(parseInt(days, 10) || DAYS_AHEAD, 1), 31);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  // ----- Events -----
  const events = [], calendars = [];
  CalendarApp.getAllCalendars().forEach(function (cal) {
    if (cal.isHidden() || !cal.isSelected()) return;
    const name = cal.getName();
    const mine = cal.isOwnedByMe() && OTHER_CALENDARS.indexOf(name) === -1;
    const calId = cal.getId();
    calendars.push({ id: calId, name: name, mine: mine });
    cal.getEvents(start, end).forEach(function (ev) {
      try {
        if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return; // skip declined
      } catch (e) {}
      const allDay = ev.isAllDayEvent();
      events.push({
        title: ev.getTitle() || '(no title)',
        start: (allDay ? ev.getAllDayStartDate() : ev.getStartTime()).toISOString(),
        end: (allDay ? ev.getAllDayEndDate() : ev.getEndTime()).toISOString(),
        allDay: allDay,
        mine: mine,
        calendar: name,
        calId: calId,
        location: ev.getLocation() || '',
        notes: cleanText(ev.getDescription(), 500)
      });
    });
  });
  events.sort(function (a, b) { return a.start < b.start ? -1 : 1; });

  // ----- Tasks -----
  const lists = (Tasks.Tasklists.list({ maxResults: 100 }).items || [])
    .map(function (l) { return { id: l.id, title: l.title }; });
  const defaultId = Tasks.Tasklists.get('@default').id;
  let ids;
  if (list === 'all') ids = lists.map(function (l) { return l.id; });
  else ids = [list && lists.some(function (l) { return l.id === list; }) ? list : defaultId];

  const tasks = [];
  ids.forEach(function (id) {
    const title = (lists.filter(function (l) { return l.id === id; })[0] || {}).title || '';
    const res = Tasks.Tasks.list(id, { showCompleted: false, showHidden: false, maxResults: 100 });
    (res.items || []).forEach(function (t) {
      if (!t.title || t.status === 'completed') return;
      tasks.push({ id: t.id, title: t.title, due: t.due || null, position: t.position, listId: id, list: title });
    });
  });
  tasks.sort(function (a, b) {
    if (a.due && b.due) return a.due < b.due ? -1 : 1;
    if (a.due) return -1;
    if (b.due) return 1;
    return a.position < b.position ? -1 : 1;
  });

  return {
    events: events,
    tasks: tasks.slice(0, 40),
    calendars: calendars,
    taskLists: lists,
    defaultList: defaultId,
    generated: new Date().toISOString()
  };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run this once from the editor to grant permissions and check it works.
function testSetup() {
  const data = getData();
  Logger.log('Events: ' + data.events.length + ', Tasks: ' + data.tasks.length +
             ', Lists: ' + data.taskLists.map(function (l) { return l.title; }).join(', '));
}
