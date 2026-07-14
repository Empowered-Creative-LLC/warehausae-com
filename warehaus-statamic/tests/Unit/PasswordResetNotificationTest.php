<?php

namespace Tests\Unit;

use App\Models\User;
use App\Notifications\PasswordReset;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class PasswordResetNotificationTest extends TestCase
{
    public function test_reset_mail_uses_absolute_cp_url_and_plain_link_line(): void
    {
        URL::forceRootUrl('https://warehausae-com-dev-ee1qzs.laravel.cloud');
        URL::forceScheme('https');
        config(['app.url' => 'https://warehausae-com-dev-ee1qzs.laravel.cloud']);

        $user = new User([
            'email' => 'danny@empoweredcreative.co',
            'name' => 'Daniel Ferry',
        ]);

        $mail = (new PasswordReset('test-token'))->toMail($user);
        $html = $mail->render();

        $expected = 'https://warehausae-com-dev-ee1qzs.laravel.cloud/cp/auth/password/reset/test-token';

        $this->assertStringContainsString('href="'.$expected, $html);
        $this->assertStringContainsString('Reset link: '.$expected, $html);
        $this->assertStringContainsString('Reset Password', $html);
    }
}
