<?php
$errors ??= [];
$sent ??= false;
?>
<Layouts.App title="Contact">
    <section class="contact">
        <h1>Contact us</h1>
        <?php if ($sent): ?>
            <Alert message="Thanks, we'll be in touch!" type="success" />
        <?php else: ?>
            <?php if (!empty($errors)): ?>
                <Alert message="Please fix the errors below." type="danger" dismissible={true} />
                <ul class="errors">
                    @foreach ($errors as $error)
                        <li>@{ $error }</li>
                    @endforeach
                </ul>
            <?php endif ?>
            <form method="post" action="/contact">
                <label for="email">Email</label>
                <input type="email" name="email" id="email" required>
                <label for="message">Message</label>
                <textarea name="message" id="message" required></textarea>
                <Button label="Send" variant="primary" />
            </form>
        <?php endif ?>
    </section>
</Layouts.App>
