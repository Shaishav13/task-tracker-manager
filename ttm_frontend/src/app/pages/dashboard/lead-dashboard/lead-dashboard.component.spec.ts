import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeadDashboardComponent } from './lead-dashboard.component';

describe('LeadDashboardComponent', () => {
  let component: LeadDashboardComponent;
  let fixture: ComponentFixture<LeadDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeadDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeadDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
