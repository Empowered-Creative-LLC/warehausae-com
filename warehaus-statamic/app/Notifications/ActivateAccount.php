<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;

class ActivateAccount extends Notification
{
    use Queueable;

    public function __construct(public string $token) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = $this->activateUrl($notifiable);

        return (new MailMessage)
            ->subject('Activate your Warehaus account')
            ->greeting('Hello!')
            ->line('An account has been created for you. Click the button below to set your password and activate your account.')
            ->action('Activate Account', $url)
            ->line('If you did not expect this invitation, you can ignore this email.')
            ->line('Activation link: '.$url)
            ->withSymfonyMessage(function ($message) {
                $message->getHeaders()->addTextHeader('X-SMTPAPI', json_encode([
                    'filters' => [
                        'clicktrack' => ['settings' => ['enable' => 0]],
                        'opentrack' => ['settings' => ['enable' => 0]],
                    ],
                ]));
            });
    }

    protected function activateUrl(object $notifiable): string
    {
        URL::forceRootUrl(rtrim((string) config('app.url'), '/'));
        URL::forceScheme(parse_url((string) config('app.url'), PHP_URL_SCHEME) ?: 'https');

        return route('statamic.account.activate', [
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ], absolute: true);
    }
}
