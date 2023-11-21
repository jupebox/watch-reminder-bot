require('dotenv').config();
const { CALENDAR_EVENT, FILE_PATH, TOKEN } = process.env;
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require("fs");
const client = new Client({
  allowedMentions: { parse: ['users', 'roles'] },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});
const {
  millisecondsInTenMinutes,
  millisecondsInOneHour,
  millisecondsInTwoHours,
  millisecondsInOneDay,
  millisecondsInOneWeek,
  dayIndeces,
  formatDate,
  nextWatchDate,
  todayDayIndex,
} = require("./helpers.js");

const calendarEventLines = fs.readFileSync(CALENDAR_EVENT, {encoding: "utf8"}).toString().split("\n");

const log = (message) => {
  console.log(message);
  const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
  const { logChannelId } = schedule;
  if (logChannelId) {
    const channel = client.channels.cache.get(logChannelId);
    channel.send(message);
  }
}

const generateCalendarEvent = (reminder) => {
  const {
    cadence,
    channelId,
    episodes,
    episodesWatched = 0,
    name,
  } = reminder;
  const now = new Date();
  const eventDate = nextWatchDate(reminder);
  const makeTwoDigits = (input) => {
    return `0${input}`.slice(-2);
  }
  const makeTimestamp = (date) => {
    return `${date.getFullYear()}${makeTwoDigits(date.getMonth() + 1)}${makeTwoDigits(date.getDate())}T${makeTwoDigits(date.getHours())}${makeTwoDigits(date.getMinutes())}${makeTwoDigits(date.getSeconds())}`;
  }
  const nowTimeStamp = makeTimestamp(now);
  const watchesLeft = Math.floor((episodes - episodesWatched) / 2);
  const startTimeStamp = makeTimestamp(eventDate);
  eventDate.setTime(eventDate.getTime() + millisecondsInOneHour);
  const endTimeStamp = makeTimestamp(eventDate);
  
  const newEvent = calendarEventLines.map(line => {
    const [key, value] = line.split(":");
    let newValue;
    switch (key) {
      case "CREATED":
      case "LAST-MODIFIED":
      case "DTSTAMP":
        newValue = `${nowTimeStamp}Z`;
        break;
      case "UID":
        newValue = `${now.getTime()}-discord-anime-scheduling-bot`;
        break;
      case "RRULE":
        newValue = `FREQ=WEEKLY;INTERVAL=${cadence};COUNT=${watchesLeft}`;
        break;
      case "DTSTART;TZID=America/Los_Angeles":
        newValue = startTimeStamp;
        break;
      case "DTEND;TZID=America/Los_Angeles":
        newValue = endTimeStamp;
        break;
      case "SUMMARY":
        newValue = name;
        break;
      default:
        return `${key}:${value}`;
    }
    return `${key}:${newValue}`;
  });
  fs.writeFileSync(CALENDAR_EVENT, newEvent.join("\n"));
  const channel = client.channels.cache.get(channelId);
  try {
    channel.send({
      files: [{
        attachment: CALENDAR_EVENT,
        name: `${name.toLowerCase().replaceAll(" ", "-")}.ics`,
        description: `Calendar event for ${name}`
      }]
    });
  } catch (err) {
    channel.send("Unable to send calendar event file.");
  }
}

let reminderCount = 0; // prevent duplicate reminders from being set on the same day
let earlyReminder; // 2 hour reminder
let lateReminder; // 10 minute reminder
let cleanupTimer; // 2 hour timer after watch time to mark the show as watched
let watchedShow = false;

const remindToWatch = (reminder) => {
  const {
    channelId,
    emoji,
    role,
    name,
    lastWatchDate,
    episodes,
    episodesWatched = 0,
  } = reminder;
  const now = new Date();
  const todayDate = formatDate(now);
  const eventDate = nextWatchDate(reminder);
  const millisecondsUntilEvent = eventDate.getTime() - now.getTime();
  if (millisecondsUntilEvent < 0) {
    if (lastWatchDate !== todayDate && todayDate === formatDate(eventDate)) {
      // the show hasn't been marked as watched yet, but it was supposed to be watched and reminded for today
      watchShow();
    }
    return;
  }
  log(`setting reminders for ${name}! ${Math.round(millisecondsUntilEvent / 1000 / 60 / 60)} hours until the event.`);
  if ((millisecondsUntilEvent - millisecondsInTwoHours) < 0) {
    // skip the 2 hour reminder
    reminderCount++;
    if ((millisecondsUntilEvent - millisecondsInOneHour) > 0) {
      // send a makeup reminder
      const channel = client.channels.cache.get(channelId);
      channel.send(`${role} time within the next 2 hours! ${emoji}`);
    }
  } else {
    earlyReminder = setTimeout(() => {
      if (reminderCount === 0) {
        const channel = client.channels.cache.get(channelId);
        channel.send(`${role} time in 2 hours! ${emoji}`);
        reminderCount++;
      }
    }, (millisecondsUntilEvent - millisecondsInTwoHours));
  }
  let episodesToWatch = 2;
  if (episodes - episodesWatched === 3) {
    episodesToWatch = 3;
  }
  if (episodes - episodesWatched === 1) {
    episodesToWatch = 1;
  }
  const episodeText = episodesToWatch === 1 ? episodesWatched + 1 : `${episodesWatched + 1}-${episodesWatched + episodesToWatch}`;
  if ((millisecondsUntilEvent - millisecondsInTenMinutes) < 0) {
    // skip the 10 minute reminder and just remind immediately
    if (reminderCount === 1) {
        const channel = client.channels.cache.get(channelId);
        channel.send(`${role} ${episodeText} imminently! ${emoji}`);
        channel.send(`!neko start`);
        reminderCount = 0;
      }
  } else {
    lateReminder = setTimeout(() => {
      if (reminderCount === 1) {
        const channel = client.channels.cache.get(channelId);
        channel.send(`${role} ${episodeText} in 10 minutes! ${emoji}`);
        channel.send(`!neko start`);
        reminderCount = 0;
      }
    }, (millisecondsUntilEvent - millisecondsInTenMinutes));
  }
  // mark the show as watched
  cleanupTimer = setTimeout(() => {
    if (!watchedShow) {
        watchShow();
    }
  }, (millisecondsUntilEvent + millisecondsInTwoHours));
}

const postSchedule = (reminders, scheduleChannelId, delay = true) => {
  const now = new Date();
  // exclude reminders for shows that aren't happening this week
  // todo: support future start dates for upcoming weekly shows
  const thisWeekReminders = reminders
    .map((reminder) => {
      reminder.nextWatchDate = nextWatchDate(reminder);
      return reminder;
    })
    .filter(reminder => {
      const { cadence, episodes, episodesWatched, nextWatchDate } = reminder;
      if (episodes <= episodesWatched) {
        // we're done with this show and it just needs to be cleaned up
        return;
      }
      if (cadence === 1) {
        return reminder;
      }
      const todayMilliseconds = now.getTime();
      const nextWeekMilliseconds = todayMilliseconds + millisecondsInOneWeek;
      const nextWatchTime = new Date(nextWatchDate).getTime();
      if ((nextWatchTime > todayMilliseconds) && (nextWatchTime < nextWeekMilliseconds)) {
        return reminder;
      }
    });
  
  if (!thisWeekReminders.length) {
    return;
  }

  // create the schedule string
  const schedule = dayIndeces.reduce((message, day) => {
    const reminder = thisWeekReminders.find(reminder => reminder.day.toLowerCase() === day) || {};
    const upperDay = `${day.slice(0, 1).toUpperCase()}${day.slice(1)}`;
    let daySchedule = `${upperDay}: no stream`;
    if (reminder && reminder.name) {
      const { name, episodes, episodesWatched = 0, nextWatchDate } = reminder;
      let isFinale = false;
      let episodeCount = 2;
      if (episodes - episodesWatched === 3) {
        episodeCount = 3;
      }
      if (episodes - episodesWatched === 1) {
        episodeCount = 1;
      }
      const episodeText = episodeCount === 1 ? episodesWatched + 1 : `${episodesWatched + 1}-${episodesWatched + episodeCount}`;
      if ((episodesWatched + episodeCount) === episodes) {
        isFinale = true;
      }
      const formattedTime = `<t:${Math.round(nextWatchDate.getTime()/1000)}:t>`;
      daySchedule = `${upperDay}: ${name} ${episodeText}${isFinale ? " (finale!)" : ""} @ ${formattedTime}`;
    }
    if (message) {
      return `${message}\n${daySchedule}`;
    }
    return daySchedule;
  }, "");

  // hardcoded for now
  const weekStartDate = new Date();
  weekStartDate.setTime(weekStartDate.getTime() + (millisecondsInOneDay * 2));
  const weekStart = `${`0${(weekStartDate.getMonth() + 1)}`.slice(-2)}/${`0${weekStartDate.getDate()}`.slice(-2)}`;
  weekStartDate.setTime(weekStartDate.getTime() + (millisecondsInOneDay * 6));
  const weekEnd = `${`0${(weekStartDate.getMonth() + 1)}`.slice(-2)}/${`0${weekStartDate.getDate()}`.slice(-2)}`;
  // this function gets called at midnight on Saturday,
  // so this delays the schedule for 8 hours so it doesn't get posted in the middle of the night
  // technically this is going to get called at some other time in some other time zone but wow I don't care. as long as it's posted on saturday it's fine
  if (delay) {
    log("Posting schedule in 8 hours");
    log(schedule);
    setTimeout(() => {
      const channel = client.channels.cache.get(scheduleChannelId);
      channel.send(`Anime schedule ${weekStart} - ${weekEnd}:\n${schedule}`);
    }, (millisecondsInOneHour * 8));
  } else {
    const channel = client.channels.cache.get(scheduleChannelId);
    channel.send(`Anime schedule ${weekStart} - ${weekEnd}:\n${schedule}`);
  }
}

const dumpSchedule = (reminder) => {
  const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
  const { reminders = [], logChannelId } = schedule;
  if (logChannelId) {
    const channel = client.channels.cache.get(logChannelId);
    if (reminder) {
      channel.send(JSON.stringify(reminder));
    } else {
      channel.send(JSON.stringify(reminders));
    }
  }
}

// recursive function called once a day at midnight to set the day's reminders
const checkForReminders = () => {
  watchedShow = false;
  const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
  const { reminders = [], scheduleChannelId } = schedule;
  if (!reminders.length) {
    return;
  }

  const nowDayIndex = todayDayIndex();

  if (nowDayIndex === 5 && scheduleChannelId) {
    postSchedule(reminders, scheduleChannelId);
  }

  const now = new Date();
  const todayDate = formatDate(now); // strip out time information

  const reminder = reminders.find(reminder => formatDate(nextWatchDate(reminder)) === todayDate);
  if (reminder) {
    if (Number(reminder.episodesWatched) !== Number(reminder.episodes)) {
      remindToWatch(reminder);
    } else {
      // clean up shows with no episodes left to watch
      deleteReminder(reminder.name);
    }
  }
  // check at midnight for tomorrow's reminders
  const minutesUntilTheHour = 60 - now.getMinutes();
  const hoursUntilTomorrow = 23 - now.getHours();
  setTimeout(() => {
    checkForReminders();
  }, ((hoursUntilTomorrow * 60) + minutesUntilTheHour) * 60 * 1000);
}

const watchShow = (specificReminder) => {
  const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
  const { reminders = [] } = schedule;
  const now = new Date();
  const todayDate = formatDate(now); // strip out time information
  const reminder = specificReminder ? specificReminder : reminders.find(reminder => formatDate(nextWatchDate(reminder)) === todayDate);
  if (!reminder) return;
  const { episodes, episodesWatched = 0, lastWatchDate } = reminder;
  let episodeCount = 2;
  if (episodes - episodesWatched === 3) {
    episodeCount = 3;
  }
  if (lastWatchDate !== todayDate) {
    reminder.episodesWatched = episodesWatched + episodeCount;
    reminder.lastWatchDate = specificReminder ? formatDate(nextWatchDate(reminder)) : todayDate;
    reminder.episodesWatchedLastSession = episodeCount;
    fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
    log(`Watched ${episodeCount} episodes of ${reminder.name}!`);
  }
  watchedShow = true;
}

client.on('ready', () => {
  log(`Logged in as ${client.user.tag}!`);
  checkForReminders();
});

// probably should put these parameters into an object. there's a lot of them.
const createReminder = (name, channel, role, day, time, cadence = 1, episodes = 12, emoji = ":eyes:", startWeek = 0) => {
  const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
  const { reminders = [] } = schedule;
  // only one reminder per role allowed at a time for now
  // todo: allow the same show to be watched multiple times per week by using a combination of role and day to overwrite existing reminders
  const filteredReminders = reminders.filter((reminder) => reminder.role !== role);

  const dayIndex = dayIndeces.indexOf(day.toLowerCase());
  const dayDateIndex = dayIndex === 6 ? 0 : dayIndex + 1;
  const showDate = new Date();
  const currentDayIndex = showDate.getDay();
  if (dayDateIndex !== currentDayIndex) {
    // i found this online but it added days using setDate which caused some issues when crossing months, for me
    // so! milliseconds all the way. can't go wrong with milliseconds
    const daysToAdd = (dayDateIndex + 7 - showDate.getDay()) % 7;
    showDate.setTime(showDate.getTime() + (daysToAdd * millisecondsInOneDay));
  }
  if (startWeek !== 0) {
    showDate.setTime(showDate.getTime() + (startWeek * millisecondsInOneWeek));
  }
  let lastWatchDate = showDate;
  // if the show started in the past, that IS the last watch date
  // don't need to work backwards to figure out what it was
  if (startWeek > -1) {
    lastWatchDate = showDate.setTime(showDate.getTime() - (cadence * millisecondsInOneWeek));
  }

  filteredReminders.push({
    cadence,
    channel,
    channelId: channel.slice(2, -1),
    day,
    dayIndex,
    emoji,
    episodes: Number(episodes),
    episodesWatched: 0,
    lastWatchDate: formatDate(new Date(lastWatchDate)),
    name,
    role,
    time, // must be in pacific time for now
  });
  schedule.reminders = filteredReminders.sort((a, b) => {
    return a.dayIndex < b.dayIndex ? -1 : 0;
  });
  fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
}

const deleteReminder = (reminderKey) => {
  const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
  const { reminders = [] } = schedule;
  const filteredReminders = reminders.filter((reminder) => reminder.channel !== reminderKey && reminder.role !== reminderKey && reminder.day !== reminderKey.toLowerCase() && reminder.name.toLowerCase() !== reminderKey.toLowerCase());
  schedule.reminders = filteredReminders;
  fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
}

// watched phrases:
// !reminder set (create a reminder)
// !reminder delete (delete one or more reminders)
// !reminder list (generate a list of all existing reminders)
// !reminder setup (set information other than reminders)
// !reminder log setup (set log channel)
// !reminder debug (dump the whole schedule to the logs channel)
// !reminder snooze (cancel timers for the day before they fire)
// !reminder rollback (after a show has been reminded for, decrement episodes for that event to what they were before the event)
// !reminder increment (add an episode to the episodesWatched count)
// !reminder decrement (remove an episode from the episodesWatched count)
// !reminder calendar (generate an ics file with the event information)
// !reminder watch (sets the watch date to the most recent expected watch date and updates the episode counts)
// !reminder my calendar (doesn't currently work; planned to get all reminders for the user and generate a single ics file of all of that user's current shows)
// stretch goal: once hosted, create a server that updates and maintains each user's calendar on a daily basis and delivers the ics file via a link, so that google calendar can poll that link for updates and automatically add and remove shows
// !reminder help (list all commands)
// !neko stop (watched phrase by watch party; usually typed when the show is over for the day, so we can watch it to see if the show should be updated)
// !reminder schedule (if the bot dies before it can post the weekly schedule, post a catchup schedule)
client.on('messageCreate', async msg => {
  const { channelId, content, author, guildId } = msg;
  const filter = m => author.id === m.author.id;
  const currentChannel = client.channels.cache.get(channelId);
  if (content === "!reminder set") {
    let name, channel, role, day, time, cadence, episodes, emoji, startWeek = 0;
    currentChannel.send("What's the name of the show?");
    try {
      const messages = await currentChannel.awaitMessages({ filter, time: 20000, max: 1, errors: ['time'] });
      name = messages.first().content;
    } catch {
      currentChannel.send("Request timed out. Reminder not created.");
      return;
    }
    currentChannel.send(`Please provide the remaining details for the ${name} reminder. Reminder parameters are: channel, role, day, time, cadence (optional), episodes (optional), emoji (optional)`);
    try {
      const messages = await currentChannel.awaitMessages({ filter, time: 60000, max: 1, errors: ['time'] });
      [channel, role, day, time, cadence, episodes, emoji] = messages.first().content.split(" ");
    } catch {
      currentChannel.send("Request timed out. Reminder not created.");
      return;
    }
    if (!channel || !role || !day || !time || channel.slice(0, 2) !== "<#" || role.slice(0, 3) !== "<@&" || dayIndeces.indexOf(day.toLowerCase()) === -1) {
      currentChannel.send("Parameters incorrect; please try again.");
      return;
    }

    let number = 0;
    if (cadence) {
      currentChannel.send(`The cadence for this show is every ${cadence} week(s). Which week should it begin? 0 for this week, 1 for next week, -1 for last week, etc.`);
      try {
        const messages = await currentChannel.awaitMessages({ filter, time: 10000, max: 1, errors: ['time'] });
        number = messages.first().content;
      } catch {
        currentChannel.send("I couldn't detect a number, so I'll start it this week.");
      }
      startWeek = Number(number);
      if (isNaN(startWeek)) {
        currentChannel.send("I couldn't detect a number, so I'll start it this week.");
        startWeek = 0;
      } else {
        currentChannel.send(`Ok, the show will start in ${startWeek} week(s).`);
      }
    }
                        
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));

    if (schedule && schedule.reminders && schedule.reminders.some(reminder => reminder.role === role)) {
      currentChannel.send("A reminder for this role already exists. Replace the existing reminder?");
      try {
        const messages = await currentChannel.awaitMessages({ filter, time: 20000, max: 1, errors: ['time'] });
        const msg = messages.first().content;
        if (msg.slice(0, 1).toLowerCase() === "y") {
          createReminder(name, channel, role, day, time, cadence, episodes, emoji, startWeek);
          currentChannel.send("Ok, I'll replace it!");
        } else {
          currentChannel.send("Existing reminder not replaced.");
        }
        return;
      } catch (err) {
        log(err);
        currentChannel.send("Request timed out. Existing reminder not replaced.");
        return;
      }
    }
    createReminder(name, channel, role, day, time, cadence, episodes, emoji, startWeek);
    currentChannel.send("Reminder created!");
  } else if (content.indexOf("!reminder delete") === 0) {
    let reminderKey = content.slice("!reminder delete".length + 1);
    if (!reminderKey || !reminderKey.length) {
      currentChannel.send("Which reminder would you like to delete? Please specify role, channel, name, or day.");
      try {
        const messages = await currentChannel.awaitMessages({ filter, time: 10000, max: 1, errors: ['time'] });
        reminderKey = messages.first().content;
      } catch {
        currentChannel.send("No key detected. No reminders deleted.");
      }
    }
    if (!reminderKey || !reminderKey.length) {
      currentChannel.send("No key detected. No reminders deleted.");
      return;
    }
    currentChannel.send("Are you sure you want to delete reminders? FYI, deleting by day of the week clears ALL reminders for that day.");
    try {
      const messages = await currentChannel.awaitMessages({ filter, time: 10000, max: 1, errors: ['time'] });
      msg = messages.first().content;
      if (msg.slice(0, 1).toLowerCase() === "y") {
        deleteReminder(reminderKey);
        currentChannel.send("Ok, reminder(s) deleted.");
      } else {
        currentChannel.send("Reminder(s) not deleted.");
      }
    } catch {
      currentChannel.send("Request timed out. Reminder(s) not deleted.");
    }
  } else if (content === "!reminder list") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders } = schedule;
    const list = reminders.reduce((prev, curr) => {
      const { name, cadence, day, emoji, episodes, episodesWatched } = curr;
      const eventDate = nextWatchDate(curr);
      const formattedTime = `<t:${Math.round(eventDate.getTime()/1000)}:t>`;
      const message = episodesWatched >= episodes ? "" : `${emoji} ${name}${Number(cadence) !== 1 ? ` every ${cadence} weeks` : ""} on ${day.slice(0, 1).toUpperCase()}${day.slice(1)} at ${formattedTime}`;
      if (prev) {
        if (message) {
          return `${prev}\n${message}`;
        }
        return prev;
      }
      return message;
    }, "");
    currentChannel.send({content: list || "No reminders are set."});
  } else if (content === "!reminder setup") {
    currentChannel.send("In which channel should the schedule be posted?");
    let channel;
    try {
      const messages = await currentChannel.awaitMessages({ filter, time: 20000, max: 1, errors: ['time'] });
      channel = messages.first().content;
    } catch {
      currentChannel.send("Request timed out. Setup failed.");
      return;
    }
    if (channel && channel.slice(0, 2) !== "<#") {
      currentChannel.send("That doesn't look like a channel. Please restart setup.");
      return;
    }
    const scheduleChannelId = channel.slice(2, -1);
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    schedule.scheduleChannelId = scheduleChannelId;
    fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
    currentChannel.send("Channel set!");
  } else if (content === "!reminder log setup") {
    currentChannel.send("In which channel should the logs be posted?");
    let channel;
    try {
      const messages = await currentChannel.awaitMessages({ filter, time: 20000, max: 1, errors: ['time'] });
      channel = messages.first().content;
    } catch {
      currentChannel.send("Request timed out. Setup failed.");
      return;
    }
    if (channel && channel.slice(0, 2) !== "<#") {
      currentChannel.send("That doesn't look like a channel. Please restart log setup.");
      return;
    }
    const logChannelId = channel.slice(2, -1);
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    schedule.logChannelId = logChannelId;
    fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
    currentChannel.send("Channel set!");
  } else if (content === "!reminder debug") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders } = schedule;
    const reminder = reminders.find(reminder => {
      const { channelId: reminderChannelId } = reminder;
      return (channelId === reminderChannelId);
    });
    if (reminder && reminder.name) {
      dumpSchedule(reminder);
    } else {
      dumpSchedule();
    }
  } else if (content === "!reminder snooze") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [] } = schedule;
    const reminder = reminders.find(reminder => {
      const { channelId: reminderChannelId } = reminder;
      return (channelId === reminderChannelId);
    });
    if (reminder && reminder.name) {
      currentChannel.send(`Would you like to skip watching ${reminder.name} today?`);
      try {
        const messages = await currentChannel.awaitMessages({ filter, time: 10000, max: 1, errors: ['time'] });
        const msg = messages.first().content;
        if (msg.slice(0, 1).toLowerCase() === "y") {
          clearTimeout(earlyReminder);
          clearTimeout(lateReminder);
          clearTimeout(cleanupTimer);
          reminderCount = 0;
          reminder.lastWatchDate = formatDate(new Date());
          fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
          currentChannel.send("Ok, today's reminders canceled.");
        } else {
          currentChannel.send("Enjoy the show!");
        }
        return;
      } catch (err) {
        log(err);
        currentChannel.send("Request timed out. Reminders not canceled.");
        return;
      }
    }
  } else if (content === "!reminder rollback") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [] } = schedule;
    const reminder = reminders.find(reminder => {
      const { channelId: reminderChannelId } = reminder;
      return (channelId === reminderChannelId);
    });
    const { episodesWatchedLastSession, episodesWatched = 0 } = reminder;
    if (reminder && reminder.name) {
      currentChannel.send(`Reset episode count for ${reminder.name} from ${episodesWatched} to ${episodesWatched - episodesWatchedLastSession}?`);
      try {
        const messages = await currentChannel.awaitMessages({ filter, time: 10000, max: 1, errors: ['time'] });
        const msg = messages.first().content;
        if (msg.slice(0, 1).toLowerCase() === "y") {
          reminder.episodesWatched = reminder.episodesWatched - episodesWatchedLastSession;
          fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
          currentChannel.send(`Ok, the episode count has been set to ${episodesWatched - episodesWatchedLastSession}.`);
        } else {
          currentChannel.send(`Episode count left at ${episodesWatched}.`);
        }
        return;
      } catch (err) {
        log(err);
        currentChannel.send("Request timed out.");
        return;
      }
    }
  } else if (content === "!reminder increment") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [] } = schedule;
    const reminder = reminders.find(reminder => {
      const { channelId: reminderChannelId } = reminder;
      return (channelId === reminderChannelId);
    });
    const { episodesWatched, name } = reminder;
    if (reminder && reminder.name) {
      currentChannel.send(`Incremented episode count of ${name} from ${episodesWatched} to ${episodesWatched + 1}.`);
      reminder.episodesWatched = episodesWatched + 1;
      fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
    }
  } else if (content === "!reminder decrement") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [] } = schedule;
    const reminder = reminders.find(reminder => {
      const { channelId: reminderChannelId } = reminder;
      return (channelId === reminderChannelId);
    });
    const { episodesWatched, name } = reminder;
    if (reminder && reminder.name) {
      currentChannel.send(`Decremented episode count of ${name} from ${episodesWatched} to ${episodesWatched - 1}.`);
      reminder.episodesWatched = episodesWatched - 1;
      fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
    }
  } else if (content === "!reminder calendar") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [] } = schedule;
    const reminder = reminders.find(reminder => {
      const { channelId: reminderChannelId } = reminder;
      return (channelId === reminderChannelId);
    });
    if (reminder && reminder.name) {
      generateCalendarEvent(reminder);
    } else {
      currentChannel.send("No reminder found for this channel.");
    }
  } else if (content === "!reminder watch") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [] } = schedule;
    const reminder = reminders.find(reminder => {
      const { channelId: reminderChannelId } = reminder;
      return (channelId === reminderChannelId);
    });
    if (reminder && reminder.name) {
      watchShow(reminder);
      currentChannel.send("Ok, marked the show as watched on the last expected watch date!");
    } else {
      currentChannel.send("No reminder found for this channel.");
    }
  }
  // else if (content === "!reminder my calendar") {
  //   const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
  //   const { reminders = [] } = schedule;
  //   const guild = client.guilds.cache.find(guild => guild.id === guildId);
  //   const { members } = guild;
  //   const member = members.cache.find(member => member.user.id === author.id);
  //   const memberRoleIds = member.roles.cache.map(role => role.id);
  //   const myReminders = reminders.filter(reminder => {
  //     const { role } = reminder;
  //     const roleId = role.slice(3, -1);
  //     return memberRoleIds.includes(roleId);
  //   });
  //   log(myReminders.map(reminder => reminder.name));
  // } 
  else if (content === "!reminder help") {
    currentChannel.send("Commands:\n!reminder set (create a reminder)\n!reminder delete (delete one or more reminders)\n!reminder list (list all existing reminders)\n!reminder setup (set information other than reminders)\n!reminder log setup (set the log channel)\n!reminder debug (dump the schedule for the current channel's reminder in the log channel)\n!reminder snooze (cancel timers for the day before they're sent)\n!reminder rollback (tell the bot you didn't watch the show after the reminders have already sent)\n!reminder increment (add an episode to the episodes watched count)\n!reminder decrement (remove an episode from the episodes watched count)\n!reminder calendar (generate a calendar event file for that channel's show)\n!reminder watch (mark the current channel's show as watched)\n!reminder schedule (post the schedule to the schedule channel)\n!reminder edit (modify an existing reminder)");
  } else if (content === "!neko stop") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [] } = schedule;
    const reminder = reminders.find(reminder => {
      const { channelId: reminderChannelId } = reminder;
      return (channelId === reminderChannelId);
    });
    if (reminder && reminder.name) {
      clearTimeout(cleanupTimer);
      watchShow();
    }
  } else if (content === "!reminder schedule") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [], scheduleChannelId } = schedule;
    postSchedule(reminders, scheduleChannelId, false);
  } else if (content === "!reminder edit") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [] } = schedule;
    const reminder = reminders.find(reminder => {
      const { channelId: reminderChannelId } = reminder;
      return (channelId === reminderChannelId);
    });
    const { episodes, episodesWatched, name, lastWatchDate, time } = reminder;
    if (reminder && reminder.name) {
      currentChannel.send(`What about the ${name} reminder do you want to edit? Try "date", "time", or "episodes".`);
      try {
        const messages = await currentChannel.awaitMessages({ filter, time: 20000, max: 1, errors: ['time'] });
        const msg = messages.first().content;
        if (msg.trim().toLowerCase() === "date") {
          currentChannel.send(`The date ${name} was last watched is ${lastWatchDate}. The next expected watch date is ${nextWatchDate(reminder)}. Modifying the last watched date will update the next watch date according to the cadence and other reminder rules. What should the new last watched date be?`);
          try {
            const messages = await currentChannel.awaitMessages({ filter, time: 20000, max: 1, errors: ['time'] });
            const msg = messages.first().content;
            if (isNaN(new Date(msg).getTime())) {
              currentChannel.send("I can't parse that date. Please format it like MM-DD-YYYY.");
            } else {
              reminder.lastWatchDate = msg;
              fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
              currentChannel.send(`The next expected watch date is now ${nextWatchDate(reminder)}!`);
            }
          } catch (err) {
            log(err);
            currentChannel.send("Request timed out.");
            return;
          }
        } else if (msg.trim().toLowerCase() === "time") {
          currentChannel.send(`${name} is currently watched at ${time} pacific. What time would you like to watch it at?`);
          try {
            const messages = await currentChannel.awaitMessages({ filter, time: 20000, max: 1, errors: ['time'] });
            const msg = messages.first().content;
            reminder.time = msg;
            fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
            currentChannel.send(`${name} will now be watched at ${reminder.time}!`);
          } catch (err) {
            log(err);
            currentChannel.send("Request timed out.");
            return;
          }
        } else if (msg.trim().toLowerCase() === "episodes") {
          currentChannel.send(`You have watched ${episodesWatched} out of ${episodes} episodes for ${name}. To update just the number of episodes total, type one number. To update both, type the total episodes first, followed by the number of episodes you have watched already, separated by a space. To update just the number of episodes watched, try the "watch", "increment", or "decrement" commands.`);
          try {
            const messages = await currentChannel.awaitMessages({ filter, time: 20000, max: 1, errors: ['time'] });
            const msg = messages.first().content;
            const [total, watched] = msg.split(" ");
            if (total && Number(total)) {
              reminder.episodes = Number(total);
            }
            if (watched && Number(watched)) {
              reminder.episodesWatched = Number(watched);
            }
            fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
            currentChannel.send(`You have now watched ${reminder.episodesWatched} out of ${reminder.episodes} episodes of ${name}!`);
          } catch (err) {
            log(err);
            currentChannel.send("Request timed out.");
            return;
          }
        }
        return;
      } catch (err) {
        log(err);
        currentChannel.send("Request timed out.");
        return;
      }
    }
  }
});

client.login(TOKEN);