# Watch Reminder Bot

I've been running an anime club in a discord server since 2020 and have been manually reminding folks multiple times a day about which show we plan to watch. I finally realized 3 years later that this was a task that could and should be automated, so I made this bot. If you also want to do this highly specific thing, feel free to also use this bot code for your own server.

## Assumptions
- You have a discord server where groups of people need to be reminded to watch a show together
- Groups of users in the server have pingable roles 
- Each role corresponds to one channel, with no overlap between roles and channels
- The shows are watched at the same time each week
- Each show is only watched once per week at maximum
- 2 episodes are watched at a time, unless it's a season finale with an odd number of episodes, in which case 3 episodes are watched
- The host server is in Pacific time
- You have a channel where you want to post the upcoming week's entire schedule on Saturday at 8am
- You want to ping a role twice before showtime - 2 hours before and 10 minutes before
- Optionally, you are also using a Watch Party bot, which uses the commands `!neko start` and `!neko stop`. Nothing will break if you're not using this bot, it's just a quality of life thing

## Files not included
- A sample calendar event (.ics) file, which is modified when generating a calendar event for a single show
- A JSON file containing all of the reminders created with `!reminder set`. The bot frequently reads from and writes to this file
- An .env file containing `CALENDAR_EVENT` `FILE_PATH`, `TOKEN` values. `CALENDAR_EVENT` is the path to to the sample .ics file. `FILE_PATH` is the the path to the reminder JSON. `TOKEN` is the authorization token for the bot

## Recognized commands
- `!reminder set` adds reminders to the JSON
- `!reminder list` prints a list of all reminders currently in the JSON
- `!reminder delete` deletes a reminder. Should only be necessary if the reminder was not created correctly, as the bot cleans up reminders for shows that have ended by checking episode counts
- `!reminder setup` currently only allows you to set the channel to post weekly schedules in, but could be used to also set information like time zone, default reminder cadences, etc
- `!reminder snooze` cancels any reminders for a day that haven't yet posted. It also prevents the show's episode count from incrementing, if the event time has not already passed
- `!reminder rollback` resets the episode count if a show was not watched but was also not snoozed in time
- `!reminder increment` adds an episode to the episodesWatched count
- `!reminder decrement` removes an episode from the episodesWatched count
- `!reminder calendar` generates an ics file with the event information
- `!reminder schedule` posts the weekly schedule in the scheduling channel, in case the automatic schedule post didn't work or needs to be revised
- `!reminder help` lists all commands
- `!neko stop` is actually used by the Watch Party bot, but it's a common signal in our server that we're done watching for the day. Watch Reminder bot uses it as a cue to check if we watched the show and therefore increment the episode count correctly
