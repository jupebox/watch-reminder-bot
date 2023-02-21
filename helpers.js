const millisecondsInTenMinutes = 10 * 60 * 1000;
const millisecondsInOneHour = 60 * 60 * 1000
const millisecondsInTwoHours = 2 * millisecondsInOneHour;
const millisecondsInOneDay = 24 * millisecondsInOneHour;
const millisecondsInOneWeek = 7 * millisecondsInOneDay;

// we start our weeks on monday, not sunday, for scheduling purposes to group the weekend as a unit
const dayIndeces = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// iirc this is the date format that all browsers can agree is a valid date. don't quote me on that
const formatDate = date => {
    return `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`;
}

const todayDayIndex = () => {
    const now = new Date();
    let nowDayIndex = now.getDay() - 1; // convert to monday week start
    if (nowDayIndex < 0) {
        nowDayIndex = 6; // reset sunday to last day of the week
    }
    return nowDayIndex;
}

const nextWatchDate = (reminder) => {
    const { cadence, dayIndex, lastWatchDate, time } = reminder;
    const now = new Date();
    const today = formatDate(now);
    const eventDate = new Date();
    const dayDateIndex = dayIndex === 6 ? 0 : dayIndex + 1;
    let daysToAdd = (dayDateIndex + 7 - eventDate.getDay()) % 7;
    const todayMilliseconds = new Date(today).getTime();
    const nextWeekMilliseconds = todayMilliseconds + millisecondsInOneWeek;
    const lastWatchTime = new Date(lastWatchDate).getTime();
    const nextWatchTime = lastWatchTime + Number(cadence) * millisecondsInOneWeek;
    let weeksUntilNextWatch = Math.floor((nextWatchTime - todayMilliseconds) / millisecondsInOneWeek);  
    if (weeksUntilNextWatch && nextWatchTime >= nextWeekMilliseconds) {
        daysToAdd = daysToAdd + weeksUntilNextWatch * 7;
    }
    const [hour, minute = 0] = time.split(":");
    eventDate.setHours(hour, minute);
    eventDate.setTime(eventDate.getTime() + daysToAdd * millisecondsInOneDay);
    return eventDate;
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