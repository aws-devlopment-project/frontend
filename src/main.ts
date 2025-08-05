import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { Amplify } from 'aws-amplify';
import awsmobile from './app/Auth/Configure/aws-export';

Amplify.configure(awsmobile);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
