<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;

class PasswordReset extends Notification
{
    use Queueable;

    public function __construct(public string $token) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = $this->resetUrl($notifiable);

        return (new MailMessage)
            ->subject('Reset your Warehaus password')
            ->greeting('Hello!')
            ->line('You are receiving this email because we received a password reset request for your account.')
            ->action('Reset Password', $url)
            ->line('This password reset link will expire in '.config('auth.passwords.'.config('auth.defaults.passwords').'.expire', 60).' minutes.')
            ->line('If you did not request a password reset, no further action is required.')
            // Plain absolute URL on its own line so mail clients always make it clickable,
            // even when button HTML or click-tracking is stripped.
            ->line('Reset link: '.$url)
            ->withSymfonyMessage(function ($message) {
                // Disable SendGrid click/open tracking — rewritten sendgrid.net links
                // often land in spam and can appear unclickable in some clients.
                $message->getHeaders()->addTextHeader('X-SMTPAPI', json_encode([
                    'filters' => [
                        'clicktrack' => ['settings' => ['enable' => 0]],
                        'opentrack' => ['settings' => ['enable' => 0]],
                    ],
                ]));
            });
    }

    /**
     * Always build an absolute CP reset URL. Do not rely on Statamic's static
     * PasswordReset::$route (lost across queue workers / unexpected call sites).
     */
    protected function resetUrl(object $notifiable): string
    {
        URL::forceRootUrl(rtrim((string) config('app.url'), '/'));
        URL::forceScheme(parse_url((string) config('app.url'), PHP_URL_SCHEME) ?: 'https');

        return route('statamic.cp.password.reset', [
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ], absolute: true);
    }
}
