<?php

namespace App\Providers;

use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\Mailer\Bridge\Sendgrid\Transport\SendgridTransportFactory;
use Symfony\Component\Mailer\Transport\Dsn;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if ($this->app->environment('production') || laravel_cloud()) {
            URL::forceScheme('https');
        }

        // SendGrid mail transport via Symfony's SendGrid API bridge. Set
        // MAIL_MAILER=sendgrid and SENDGRID_API_KEY to enable delivery.
        Mail::extend('sendgrid', function (array $config) {
            $key = $config['key'] ?? config('services.sendgrid.key');

            return (new SendgridTransportFactory)->create(
                new Dsn('sendgrid+api', 'default', $key)
            );
        });
    }
}
