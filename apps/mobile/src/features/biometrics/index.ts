import * as LocalAuthentication from 'expo-local-authentication';

export async function canUseBiometrics(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

export async function unlockWithBiometrics(): Promise<boolean> {
  const available = await canUseBiometrics();
  if (!available) return false;

  const result = await LocalAuthentication.authenticateAsync({
    cancelLabel: 'Отмена',
    disableDeviceFallback: false,
    fallbackLabel: 'Код устройства',
    promptMessage: 'Открыть HEYS',
  });

  return result.success;
}
