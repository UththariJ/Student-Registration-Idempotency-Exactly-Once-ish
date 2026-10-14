// Globals: portal (from URL), session state, constants.
const $=s=>document.querySelector(s),ROLES=['student','lecturer','admin'],P=location.pathname.split('/')[1],E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let S=JSON.parse(sessionStorage.s||'null'),tab,pend={},D={},cm=new Date(),marking=null;
const V = {}; // view registry — each portal file adds its tabs
document.documentElement.style.setProperty('--ac',{student:'#7c6cff',lecturer:'#1fb98a',admin:'#ff9f43'}[P]||'#7c6cff');
const DEMO={student:'BIT0018 / stu123',lecturer:'lecturer1 / lec123',admin:'admin / admin123'},ICON={note:'📄',quiz:'📝',assignment:'📌'};
const TABS={student:[['studentOverview','🏠 Overview'],['courses','📚 Courses'],['learn','🎒 My Learning'],['cal','📅 Calendar'],['notes','🔔 Notifications']],lecturer:[['lecturerOverview','🏠 Overview'],['lcourses','📘 My Courses'],['add','➕ Add Content']],admin:[['adminOverview','🏠 Overview'],['users','👥 Users'],['acourses','📚 Courses'],['regs','🧾 Registrations'],['diag','🧪 Diagnostics']]};
