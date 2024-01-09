const millisecondsInTenMinutes = 10 * 60 * 1000;
const millisecondsInOneHour = 60 * 60 * 1000
const millisecondsInTwoHours = 2 * millisecondsInOneHour;
const millisecondsInOneDay = 24 * millisecondsInOneHour;
const millisecondsInOneWeek = 7 * millisecondsInOneDay;

// we start our weeks on monday, not sunday, for scheduling purposes to group the weekend as a unit
const dayIndeces = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// iirc this is the date format that all browsers can agree is a valid date. don't quote me on that
const formatDate = date => {
    let dateDate = date;
    if (typeof date === "string") {
        dateDate = new Date(date);
    }
    return `${dateDate.getMonth() + 1}-${dateDate.getDate()}-${dateDate.getFullYear()}`;
}

const todayDayIndex = () => {
    const now = new Date();
    let nowDayIndex = now.getDay() - 1; // convert to monday week start
    if (nowDayIndex < 0) {
        nowDayIndex = 6; // reset sunday to last day of the week
    }
    return nowDayIndex;
}

const convertReminderTimeStampToBetterTimeStamp = (date, time) => {
    // YYYY-MM-DDTHH:mm:ss.sssZ
    const [hour, minute = "00"] = time.split(":");
    const [month, day, year] = date.split("-");
    const make2Digits = (string) => {
        const number = Number(string);
        return number < 10 ? `0${number}` : number;
    }
    return `${year}-${make2Digits(month)}-${make2Digits(day)}T${make2Digits(hour)}:${make2Digits(minute)}:00.000-${isDST(new Date()) ? "07" : "08"}:00`;
}

const isDST = (date) => {
    let jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
    let jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
    return Math.max(jan, jul) !== date.getTimezoneOffset();
}

const nextWatchDate = (reminder) => {
    const { cadence, lastWatchDate: lastWatched, time } = reminder;
    const lastWatchTimeStamp = convertReminderTimeStampToBetterTimeStamp(lastWatched, time);
    const lastWatchDate = new Date(lastWatchTimeStamp);
    const lastWatchTime = lastWatchDate.getTime();
    const eventDate = new Date(lastWatchTime + (Number(cadence) * millisecondsInOneWeek));
    return eventDate;
    // // if that day is not the right day of the week, subtract days equal to the difference?
    // // the next watch date should be the day of the week that the show is watched on
    // const eventDateDayIndex = eventDate.getDay();
    // const dayDateIndex = dayIndex === 6 ? 0 : dayIndex + 1;
    // const dayIndexDiff = eventDateDayIndex - dayDateIndex;
    // if (dayIndexDiff) {
    //     const daysToSubtract = dayIndexDiff > 0 ? dayIndexDiff : dayIndexDiff + 7;
    //     eventDate.setTime(eventDate.getTime() - (daysToSubtract * millisecondsInOneDay))
    // }
    // return eventDate;
};

exports.millisecondsInTenMinutes = millisecondsInTenMinutes;
exports.millisecondsInOneHour = millisecondsInOneHour;
exports.millisecondsInTwoHours = millisecondsInTwoHours;
exports.millisecondsInOneDay = millisecondsInOneDay;
exports.millisecondsInOneWeek = millisecondsInOneWeek;
exports.dayIndeces = dayIndeces;
exports.formatDate = formatDate;
exports.nextWatchDate = nextWatchDate;
exports.todayDayIndex = todayDayIndex;
exports.convertReminderTimeStampToBetterTimeStamp = convertReminderTimeStampToBetterTimeStamp;