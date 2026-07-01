import * as Notifications from 'expo-notifications';

export type NotificationReadiness = {
  canAskAgain: boolean;
  granted: boolean;
  status: Notifications.PermissionStatus;
};

export async function getNotificationReadiness(): Promise<NotificationReadiness> {
  const permissions = await Notifications.getPermissionsAsync();
  return {
    canAskAgain: permissions.canAskAgain,
    granted: permissions.granted,
    status: permissions.status,
  };
}

export async function requestNotificationPermission(): Promise<NotificationReadiness> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) {
    return {
      canAskAgain: current.canAskAgain,
      granted: current.granted,
      status: current.status,
    };
  }

  const requested = await Notifications.requestPermissionsAsync();
  return {
    canAskAgain: requested.canAskAgain,
    granted: requested.granted,
    status: requested.status,
  };
}
