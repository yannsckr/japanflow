"use strict";

const { isValidRideTransition, isJourneyOpen } = module.exports = {
  isJourneyOpen(journey) {
    return !!journey?.started_at && !journey?.ended_at &&
      (!journey?.lunch_started_at || !!journey?.lunch_ended_at);
  },
  isValidRideTransition(ride, userId, action) {
    return !!ride && ride.assigned_to === userId &&
      (action === 'start' ? ride.status === 'pending' :
        action === 'finish' ? ride.status === 'accepted' : false);
  },
};
