require('dotenv').config();
const { FILE_PATH, TOKEN } = process.env;
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

let reminderCount = 0; // prevent duplicate reminders from being set on the same day
let earlyReminder; // 2 hour reminder
let lateReminder; // 10 minute reminder
let episodesWatchedToday = 0; // for rollback

const remindToWatch = (reminder) => {
  const {
    channel: channelCode,
    emoji,
    role,
    name,
  } = reminder;
  const now = new Date();
  const eventDate = nextWatchDate(reminder);
  const millisecondsUntilEvent = eventDate.getTime() - now.getTime();
  const channelId = channelCode.slice(2).slice(0, -1);
  if (millisecondsUntilEvent < 0) {
    return;
  }
  console.log(`setting reminders for ${name}! ${Math.round(millisecondsUntilEvent / 1000 / 60 / 60)} hours until the event.`);
  if ((millisecondsUntilEvent - millisecondsInTwoHours) < 0) {
    // skip the 2 hour reminder
    reminderCount++;
  } else {
    earlyReminder = setTimeout(() => {
      if (reminderCount === 0) {
        const channel = client.channels.cache.get(channelId);
        channel.send(`${role} time in 2 hours! ${emoji}`);
        reminderCount++;
      }
    }, (millisecondsUntilEvent - millisecondsInTwoHours));
  }
  if ((millisecondsUntilEvent - millisecondsInTenMinutes) < 0) {
    // skip the 10 minute reminder and just remind immediately
    if (reminderCount === 1) {
        const channel = client.channels.cache.get(channelId);
        channel.send(`${role} time imminently! ${emoji}`);
        channel.send(`!neko start`);
        reminderCount = 0;
      }
  } else {
    lateReminder = setTimeout(() => {
      if (reminderCount === 1) {
        const channel = client.channels.cache.get(channelId);
        channel.send(`${role} time in 10 minutes! ${emoji}`);
        channel.send(`!neko start`);
        reminderCount = 0;
      }
    }, (millisecondsUntilEvent - millisecondsInTenMinutes));
  }
}

const postSchedule = (reminders, scheduleChannelId) => {
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
      if ((episodesWatched + episodeCount) === episodes) {
        isFinale = true;
      }
      const formattedTime = `<t:${Math.round(nextWatchDate.getTime()/1000)}:t>`;
      daySchedule = `${upperDay}: ${name} ${episodesWatched + 1}-${episodesWatched + episodeCount}${isFinale ? " (finale!)" : ""} @ ${formattedTime}`;
    }
    if (message) {
      return `${message}\n${daySchedule}`;
    }
    return daySchedule;
  }, "");

  // this function gets called at midnight on Saturday,
  // so this delays the schedule for 8 hours so it doesn't get posted in the middle of the night
  setTimeout(() => {
    const channel = client.channels.cache.get(scheduleChannelId);
    channel.send(schedule);
  }, (millisecondsInOneHour * 8));
}

// recursive function called once a day at midnight to set the day's reminders
const checkForReminders = () => {
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
      // guard against bot dying and restarting and accidentally incrementing the episode count
      // the reminders won't be set properly though, in that case
      // todo: increment episodes and watch date AFTER the event time has passed
      // todo: store "number of episodes watched last session" in schedule.json to prevent
      // edge case where rollback or snooze will not work if bot died that day
      if (reminder.lastWatchDate !== todayDate) {
        reminder.episodesWatched = (Number(reminder.episodesWatched) || 0) + 2;
        episodesWatchedToday = 2;
        if ((Number(reminder.episodes) - reminder.episodesWatched) === 1) {
          reminder.episodesWatched = reminder.episodes;
          episodesWatchedToday = 3;
        }
        reminder.lastWatchDate = todayDate;
        fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
      }
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

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
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
    day,
    dayIndex,
    emoji,
    episodes: Number(episodes),
    episodesWatched: 0,
    lastWatchDate: formatDate(new Date(lastWatchDate)),
    name,
    role,
    time,
  });
  schedule.reminders = filteredReminders.sort((a, b) => {
    return a.dayIndex < b.dayIndex ? -1 : 0;
  });
  fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
}

// todo: pop up an error message if somebody tries to delete by a keyword that is present across multiple reminders (other than day)
// actually i don't know if that's possible since channel and role are ids and it checks for the whole name, not partial name matches
// false alarm this is fine
const deleteReminder = (reminderKey) => {
  const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
  const { reminders = [] } = schedule;
  const filteredReminders = reminders.filter((reminder) => reminder.channel !== reminderKey && reminder.role !== reminderKey && reminder.day !== reminderKey.toLowerCase() && reminder.name.toLowerCase() !== reminderKey.toLowerCase());
  schedule.reminders = filteredReminders;
  fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
}

// i'm so sorry
// watched phrases:
// !reminder set (create a reminder)
// !reminder delete (delete one or more reminders)
// !reminder list (generate a list of all existing reminders)
// !reminder setup (set information other than reminders)
// !reminder snooze (cancel timers for the day before they fire)
// !reminder rollback (after a show has been reminded for, decrement episodes for that event to what they were before the event)
// !reminder increment (add an episode to the episodesWatched count)
// !reminder decrement (remove an episode from the episodesWatched count)
// !reminder help (list all commands)
client.on('messageCreate', async msg => {
  const { channelId, content, author } = msg;
  const filter = m => author.id === m.author.id;
  const currentChannel = client.channels.cache.get(channelId);
  if (content === "!reminder set") {
    let name, channel, role, day, time, cadence, episodes, emoji, startWeek = 0;
    currentChannel.send("What's the name of the show?");
    try {
      const messages = await currentChannel.awaitMessages({ filter, time: 10000, max: 1, errors: ['time'] });
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
    if (cadence && Number(cadence) !== 1) {
      currentChannel.send(`The cadence for this show is every ${cadence} weeks. Which week should it begin? 0 for this week, 1 for next week, -1 for last week, etc.`);
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
        console.log(err);
        currentChannel.send("Request timed out. Existing reminder not replaced.");
        return;
      }
    }
    createReminder(name, channel, role, day, time, cadence, episodes, emoji, startWeek);
    currentChannel.send("Reminder created!");
  } else if (content.indexOf("!reminder delete") === 0) {
    const reminderKey = content.slice("!reminder delete".length + 1);
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
      const { name, cadence, day, emoji } = curr;
      const eventDate = nextWatchDate(curr);
      const formattedTime = `<t:${Math.round((eventDate.getTime())/1000)}:t>`;
      const message = `${emoji} ${name}${Number(cadence) !== 1 ? ` every ${cadence} weeks` : ""} on ${day.slice(0, 1).toUpperCase()}${day.slice(1)} at ${formattedTime}`;
      if (prev) {
      return `${prev}\n${message}`;
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
    const scheduleChannelId = channel.slice(2).slice(0, -1);
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    schedule.scheduleChannelId = scheduleChannelId;
    fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
    currentChannel.send("Channel set!");
  } else if (content === "!reminder snooze") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [] } = schedule;
    const reminder = reminders.find(reminder => {
      const { channel } = reminder;
      const reminderChannelId = channel.slice(2).slice(0, -1);
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
          reminderCount = 0;
          reminder.episodesWatched = reminder.episodesWatched - episodesWatchedToday;
          fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
          currentChannel.send("Ok, today's reminders canceled.");
        } else {
          currentChannel.send("Enjoy the show!");
        }
        return;
      } catch (err) {
        console.log(err);
        currentChannel.send("Request timed out. Reminders not canceled.");
        return;
      }
    }
  } else if (content === "!reminder rollback") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [] } = schedule;
    const reminder = reminders.find(reminder => {
      const { channel } = reminder;
      const reminderChannelId = channel.slice(2).slice(0, -1);
      return (channelId === reminderChannelId);
    });
    if (reminder && reminder.name) {
      currentChannel.send(`Did you skip watching ${reminder.name} today?`);
      try {
        const messages = await currentChannel.awaitMessages({ filter, time: 10000, max: 1, errors: ['time'] });
        const msg = messages.first().content;
        if (msg.slice(0, 1).toLowerCase() === "y") {
          reminder.episodesWatched = reminder.episodesWatched - episodesWatchedToday;
          fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
          currentChannel.send("Ok, the episode count has been reset.");
        } else {
          currentChannel.send(`Hope you enjoyed those ${episodesWatchedToday} episodes!`);
        }
        return;
      } catch (err) {
        console.log(err);
        currentChannel.send("Request timed out.");
        return;
      }
    }
  } else if (content === "!reminder increment") {
    const schedule = JSON.parse(fs.readFileSync(FILE_PATH, {encoding: "utf8"}));
    const { reminders = [] } = schedule;
    const reminder = reminders.find(reminder => {
      const { channel } = reminder;
      const reminderChannelId = channel.slice(2).slice(0, -1);
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
      const { channel } = reminder;
      const reminderChannelId = channel.slice(2).slice(0, -1);
      return (channelId === reminderChannelId);
    });
    const { episodesWatched, name } = reminder;
    if (reminder && reminder.name) {
      currentChannel.send(`Decremented episode count of ${name} from ${episodesWatched} to ${episodesWatched - 1}.`);
      reminder.episodesWatched = episodesWatched - 1;
      fs.writeFileSync(FILE_PATH, JSON.stringify(schedule));
    }
  } else if (content === "!reminder help") {
    currentChannel.send("Commands:\n!reminder set (create a reminder)\n!reminder delete (delete one or more reminders)\n!reminder list (list all existing reminders)\n!reminder setup (set information other than reminders)\n!reminder snooze (cancel timers for the day before they're sent)\n!reminder rollback (tell the bot you didn't watch the show after the reminders have already sent)\n!reminder increment (add an episode to the episodes watched count)\n!reminder decrement (remove an episode from the episodes watched count)");
  }
});

client.login(TOKEN);